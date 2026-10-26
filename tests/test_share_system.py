import unittest
import os
import tempfile
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

from models import Base, engine, SessionLocal, SharedFile
from share_service import ShareService
from auth import CYPHER_API_KEY
from telemetry_notifier import TelemetryNotifier

from fastapi.testclient import TestClient
from main import app

class TestShareSystem(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create database tables for the test
        Base.metadata.create_all(bind=engine)

    def setUp(self):
        # Use clean database sessions
        self.db: Session = SessionLocal()
        # Clean up database tables for fresh start
        self.db.query(SharedFile).delete()
        self.db.commit()

        # Create a temp file on disk to represent video or log files
        self.temp_file = tempfile.NamedTemporaryFile(delete=False)
        self.temp_file.write(b"Sovereign CypherTube Test File Stream Content.")
        self.temp_file.close()

        self.service = ShareService()
        self.client = TestClient(app)

    def tearDown(self):
        self.db.query(SharedFile).delete()
        self.db.commit()
        self.db.close()

        # Clean up the temp file
        if os.path.exists(self.temp_file.name):
            os.remove(self.temp_file.name)

    def test_shared_file_model_is_valid(self):
        # 1. Valid file
        file_entry = SharedFile(
            video_id="vid_001",
            share_token="token_001",
            file_path=self.temp_file.name,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            max_views=-1,
            views_count=0,
            is_active=True
        )
        self.assertTrue(file_entry.is_valid())

        # 2. Inactive file
        file_entry.is_active = False
        self.assertFalse(file_entry.is_valid())
        file_entry.is_active = True

        # 3. Expired file
        file_entry.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        self.assertFalse(file_entry.is_valid())
        file_entry.expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

        # 4. Max views exceeded
        file_entry.max_views = 5
        file_entry.views_count = 5
        self.assertFalse(file_entry.is_valid())

        file_entry.views_count = 4
        self.assertTrue(file_entry.is_valid())

    def test_share_service_create_link(self):
        # Valid creation
        res = self.service.create_share_link(
            db=self.db,
            video_id="vid_101",
            file_path=self.temp_file.name,
            expire_hours=2,
            max_views=10,
            metadata={"test_run": "yes"}
        )
        self.assertIn("share_id", res)
        self.assertIn("share_token", res)
        self.assertIn("share_url", res)
        self.assertEqual(res["max_views"], 10)

        # Check DB record
        db_record = self.db.query(SharedFile).filter(SharedFile.share_token == res["share_token"]).first()
        self.assertIsNotNone(db_record)
        self.assertEqual(db_record.video_id, "vid_101")
        self.assertEqual(db_record.metadata_payload, {"test_run": "yes"})

        # File does not exist creation
        with self.assertRaises(FileNotFoundError):
            self.service.create_share_link(
                db=self.db,
                video_id="vid_101",
                file_path="non_existent_file.mp4"
            )

    def test_share_service_validate_and_record_access(self):
        res = self.service.create_share_link(
            db=self.db,
            video_id="vid_102",
            file_path=self.temp_file.name,
            expire_hours=1,
            max_views=2
        )
        token = res["share_token"]

        # First view
        record1 = self.service.validate_and_record_access(self.db, token)
        self.assertEqual(record1.views_count, 1)

        # Second view
        record2 = self.service.validate_and_record_access(self.db, token)
        self.assertEqual(record2.views_count, 2)

        # Third view (should fail)
        with self.assertRaises(ValueError):
            self.service.validate_and_record_access(self.db, token)

    def test_share_service_revoke_link(self):
        res = self.service.create_share_link(
            db=self.db,
            video_id="vid_103",
            file_path=self.temp_file.name
        )
        token = res["share_token"]

        # Verify active
        db_record = self.db.query(SharedFile).filter(SharedFile.share_token == token).first()
        self.assertTrue(db_record.is_active)

        # Revoke
        revoked_record = self.service.revoke_share_link(self.db, token)
        self.assertFalse(revoked_record.is_active)

        # Access should be invalid now
        with self.assertRaises(ValueError):
            self.service.validate_and_record_access(self.db, token)

    def test_api_create_share_link_unauthenticated(self):
        payload = {
            "video_id": "vid_api_1",
            "file_path": self.temp_file.name,
            "expire_hours": 10,
            "max_views": 5
        }
        response = self.client.post("/api/v1/share/create", json=payload)
        self.assertEqual(response.status_code, 401)  # Missing key/token headers

        headers = {"X-API-Key": "incorrect_key"}
        response = self.client.post("/api/v1/share/create", json=payload, headers=headers)
        self.assertEqual(response.status_code, 403)  # Invalid key

    def test_api_create_share_link_authenticated(self):
        payload = {
            "video_id": "vid_api_2",
            "file_path": self.temp_file.name,
            "expire_hours": 24,
            "max_views": -1,
            "metadata": {"source": "api_test"}
        }
        # Authenticate using standard X-API-Key
        headers_key = {"X-API-Key": CYPHER_API_KEY}
        response_key = self.client.post("/api/v1/share/create", json=payload, headers=headers_key)
        self.assertEqual(response_key.status_code, 201)
        data_key = response_key.json()
        self.assertEqual(data_key["status"], "success")
        self.assertIn("share_token", data_key["share_data"])

        # Authenticate using X-Cypher-Token
        headers_token = {"X-Cypher-Token": CYPHER_API_KEY}
        response_token = self.client.post("/api/v1/share/create", json=payload, headers=headers_token)
        self.assertEqual(response_token.status_code, 201)
        data_token = response_token.json()
        self.assertEqual(data_token["status"], "success")

    def test_api_access_shared_file_endpoints(self):
        # Create share link
        payload = {
            "video_id": "vid_api_3",
            "file_path": self.temp_file.name,
            "expire_hours": 1,
            "max_views": 1
        }
        headers = {"X-API-Key": CYPHER_API_KEY}
        create_res = self.client.post("/api/v1/share/create", json=payload, headers=headers).json()
        token = create_res["share_data"]["share_token"]

        # Access shared file publicly (no authorization needed)
        access_res = self.client.get(f"/api/v1/share/access/{token}")
        self.assertEqual(access_res.status_code, 200)
        self.assertEqual(access_res.content, b"Sovereign CypherTube Test File Stream Content.")

        # Accessing second time should return 403 because max_views was set to 1
        access_res2 = self.client.get(f"/api/v1/share/access/{token}")
        self.assertEqual(access_res2.status_code, 403)

    def test_api_revoke_shared_file_endpoints(self):
        # Create share link
        payload = {
            "video_id": "vid_api_4",
            "file_path": self.temp_file.name,
            "expire_hours": 1
        }
        headers = {"X-API-Key": CYPHER_API_KEY}
        create_res = self.client.post("/api/v1/share/create", json=payload, headers=headers).json()
        token = create_res["share_data"]["share_token"]

        # Revoke unauthenticated
        revoke_unauth = self.client.post(f"/api/v1/share/revoke/{token}")
        self.assertEqual(revoke_unauth.status_code, 401)

        # Revoke authenticated
        revoke_auth = self.client.post(f"/api/v1/share/revoke/{token}", headers=headers)
        self.assertEqual(revoke_auth.status_code, 200)
        self.assertEqual(revoke_auth.json()["status"], "success")

        # Public access should now be forbidden
        access_res = self.client.get(f"/api/v1/share/access/{token}")
        self.assertEqual(access_res.status_code, 403)

    def test_api_create_share_link_timing_safety(self):
        payload = {
            "video_id": "vid_api_5",
            "file_path": self.temp_file.name,
            "expire_hours": 1
        }
        # Test various invalid key formats and lengths against constant-time check
        invalid_keys = [
            "c",
            "cypher_",
            "cypher_secure_secret_token_202",
            "cypher_secure_secret_token_2027",
            "cypher_secure_secret_token_2026_extra",
            "a" * 100,
            "",
        ]
        for key in invalid_keys:
            if not key:
                res = self.client.post("/api/v1/share/create", json=payload, headers={"X-API-Key": key})
                self.assertEqual(res.status_code, 401)
            else:
                res = self.client.post("/api/v1/share/create", json=payload, headers={"X-API-Key": key})
                self.assertEqual(res.status_code, 403)
