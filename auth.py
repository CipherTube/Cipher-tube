import hmac
import os
from fastapi import Security, HTTPException, status
from fastapi.security.api_key import APIKeyHeader

CYPHER_TOKEN_NAME = "X-Cypher-Token"
API_KEY_NAME = "X-API-Key"

cypher_token_header = APIKeyHeader(name=CYPHER_TOKEN_NAME, auto_error=False)
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

CYPHER_API_KEY = os.getenv("CYPHER_API_KEY", "cypher_secure_secret_token_2026")

def verify_api_key(
    api_key: str = Security(api_key_header),
    cypher_token: str = Security(cypher_token_header)
) -> str:
    """
    Verifies that the request provides a valid API Key or Cypher Token in constant time.
    Keeps file sharing strictly authorized against side-channel timing attacks.
    """
    provided_key = api_key or cypher_token
    if not provided_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API Key or X-Cypher-Token header."
        )

    if not hmac.compare_digest(provided_key, CYPHER_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid authorization token."
        )
    return provided_key
