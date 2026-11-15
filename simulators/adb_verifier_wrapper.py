import subprocess
import os

class AdbVerifierWrapper:
    def __init__(self, device_id: str = None, target_device_dir: str = "/sdcard/CipherTube/assets/"):
        self.device_id = device_id
        self.target_device_dir = target_device_dir
        self.local_staging_dir = "./staging_artifacts"
        os.makedirs(self.local_staging_dir, exist_ok=True)

    def run_adb_command(self, cmd: list) -> str:
        base_cmd = ["adb"]
        if self.device_id:
            base_cmd.extend(["-s", self.device_id])
        base_cmd.extend(cmd)
        
        result = subprocess.run(base_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"ADB Error executing {' '.join(base_cmd)}: {result.stderr.strip()}")
        return result.stdout.strip()

    def check_connection(self) -> bool:
        try:
            devices_output = self.run_adb_command(["devices"])
            lines = [l for l in devices_output.splitlines() if "\tdevice" in l]
            return len(lines) > 0
        except Exception:
            return False

    def scan_and_pull_artifacts(self) -> list:
        if not self.check_connection():
            print("[Notice] No active ADB device bridge found. Operating in simulation-fallback mode.")
            return []

        try:
            file_list_raw = self.run_adb_command(["shell", "ls", "-p", self.target_device_dir])
            files = [f.strip() for f in file_list_raw.splitlines() if f.strip() and not f.endswith("/")]
        except Exception:
            return []

        pulled_artifacts = []
        for file_name in files:
            remote_path = os.path.join(self.target_device_dir, file_name).replace("\\", "/")
            local_path = os.path.join(self.local_staging_dir, file_name)
            try:
                self.run_adb_command(["pull", remote_path, local_path])
                pulled_artifacts.append(local_path)
            except Exception as ex:
                print(f"Failed to pull {file_name}: {ex}")

        return pulled_artifacts
