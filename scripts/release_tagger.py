import os
import sys
import subprocess
import json

class CipherTubeReleaseTagger:
    def __init__(self, bump_type: str = "patch"):
        self.bump_type = bump_type
        self.config_path = "fern/fern.config.json"

    def bump_version(self, version: str) -> str:
        parts = list(map(int, version.split(".")))
        if self.bump_type == "major":
            parts[0] += 1
            parts[1] = 0
            parts[2] = 0
        elif self.bump_type == "minor":
            parts[1] += 1
            parts[2] = 0
        else:
            parts[2] += 1
        return ".".join(map(str, parts))

    def execute_release_pipeline(self):
        with open(self.config_path, "r") as f:
            data = json.load(f)
        new_ver = self.bump_version(data.get("version", "0.1.0"))
        data["version"] = new_ver
        with open(self.config_path, "w") as f:
            json.dump(data, f, indent=2)

        subprocess.run(["fern", "generate", "--group", "local"])
        subprocess.run(["git", "add", "."])
        subprocess.run(["git", "commit", "-m", f"chore(release): prepare release v{new_ver} [skip ci]"])
        subprocess.run(["git", "tag", "-a", f"v{new_ver}", "-m", f"Release v{new_ver}"])
        print(f"Release v{new_ver} tagged successfully.")

if __name__ == "__main__":
    bump = sys.argv[1] if len(sys.argv) > 1 else "patch"
    CipherTubeReleaseTagger(bump_type=bump).execute_release_pipeline()
