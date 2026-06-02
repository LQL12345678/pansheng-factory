import subprocess, os, time, sys

backend_dir = r"D:\2026-05-10-task-1\backend"
env = os.environ.copy()
env["NODE_PATH"] = os.path.join(backend_dir, "node_modules")

proc = subprocess.Popen(
    [r"C:\Users\Admin\.workbuddy\binaries\node\versions\22.12.0\node.exe", "--experimental-sqlite", "server.js"],
    cwd=backend_dir,
    env=env,
    stdout=open(os.path.join(backend_dir, "server.log"), "w"),
    stderr=open(os.path.join(backend_dir, "err.log"), "w")
)
print(f"Backend started with PID: {proc.pid}")
