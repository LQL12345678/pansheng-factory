import subprocess, os

frontend_dir = r"D:\2026-05-10-task-1\frontend"
env = os.environ.copy()
env["NODE_PATH"] = os.path.join(frontend_dir, "node_modules")

proc = subprocess.Popen(
    [r"C:\Users\Admin\.workbuddy\binaries\node\versions\22.12.0\node.exe", 
     os.path.join(frontend_dir, "node_modules", "vite", "bin", "vite.js"),
     "--host", "--port", "5173"],
    cwd=frontend_dir,
    env=env,
    stdout=open(os.path.join(frontend_dir, "frontend.log"), "w"),
    stderr=open(os.path.join(frontend_dir, "frontend_err.log"), "w")
)
print(f"Frontend started with PID: {proc.pid}")
