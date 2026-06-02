#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
攀升工厂设备管理系统 - 一键备份脚本
使用方法: python backup.py
"""

import os
import sys
import shutil
import zipfile
from datetime import datetime

def ignore_patterns(*patterns):
    """返回忽略指定模式的函数"""
    def _ignore_func(path, names):
        ignore_names = set()
        for pattern in patterns:
            for name in names:
                if name == pattern or name.endswith(pattern):
                    ignore_names.add(name)
        return ignore_names
    return _ignore_func

def copy_tree_safe(src, dst):
    """安全地复制目录树"""
    if not os.path.exists(src):
        return False
    os.makedirs(dst, exist_ok=True)
    for item in os.listdir(src):
        s = os.path.join(src, item)
        d = os.path.join(dst, item)
        try:
            if os.path.isdir(s):
                copy_tree_safe(s, d)
            else:
                shutil.copy2(s, d)
        except Exception as e:
            print(f"    警告: 跳过 {item} ({e})")
    return True

def main():
    print("=" * 50)
    print("    攀升工厂设备管理系统 - 一键备份脚本")
    print("=" * 50)
    print()

    # 获取项目根目录
    project_root = os.path.dirname(os.path.abspath(__file__))
    backup_dir = os.path.join(project_root, "backup")

    # 创建备份目录
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    backup_path = os.path.join(backup_dir, f"temp_backup_{timestamp}")

    os.makedirs(backup_dir, exist_ok=True)
    os.makedirs(backup_path, exist_ok=True)

    # 1. 备份后端代码
    print("[1/6] 备份后端代码...")
    backend_src = os.path.join(project_root, "backend")
    backend_dst = os.path.join(backup_path, "backend")

    if copy_tree_safe(backend_src, backend_dst):
        # 删除不需要的目录
        for exclude in ['node_modules', 'db']:
            path = os.path.join(backend_dst, exclude)
            if os.path.exists(path):
                shutil.rmtree(path, ignore_errors=True)
        print("    完成（已排除node_modules和db目录）")
    else:
        print("    后端目录不存在，跳过")

    # 2. 备份前端代码
    print("[2/6] 备份前端代码...")
    frontend_src = os.path.join(project_root, "frontend")
    frontend_dst = os.path.join(backup_path, "frontend")

    if copy_tree_safe(frontend_src, frontend_dst):
        for exclude in ['node_modules', 'dist']:
            path = os.path.join(frontend_dst, exclude)
            if os.path.exists(path):
                shutil.rmtree(path, ignore_errors=True)
        print("    完成（已排除node_modules和dist目录）")
    else:
        print("    前端目录不存在，跳过")

    # 3. 备份数据库
    print("[3/6] 备份数据库...")
    db_src = os.path.join(project_root, "devices.db")
    db_dst = os.path.join(backup_path, "database")
    os.makedirs(db_dst, exist_ok=True)

    if os.path.exists(db_src):
        shutil.copy2(db_src, os.path.join(db_dst, "equipment.db"))
        print("    完成")
    else:
        print("    数据库文件不存在，跳过")

    # 4. 备份上传文件
    print("[4/6] 备份上传文件...")
    uploads_src = os.path.join(project_root, "backend", "uploads")
    uploads_dst = os.path.join(backup_path, "uploads")

    if os.path.exists(uploads_src):
        copy_tree_safe(uploads_src, uploads_dst)
        print("    完成")
    else:
        print("    上传目录不存在，跳过")

    # 5. 备份配置文件
    print("[5/6] 备份配置文件...")
    config_dst = os.path.join(backup_path, "config")
    os.makedirs(config_dst, exist_ok=True)

    env_content = """# 环境配置
NODE_ENV=production
PORT=3001
FRONTEND_PORT=5173
DB_PATH=./db/equipment.db
"""
    with open(os.path.join(config_dst, "env.example"), "w", encoding="utf-8") as f:
        f.write(env_content)

    # 复制启动脚本
    for script in ["start.bat", "start-all.bat", "backup.py", "RESTORE_GUIDE.md", "ENVIRONMENT.md"]:
        src = os.path.join(project_root, script)
        if os.path.exists(src):
            shutil.copy2(src, backup_path)

    print("    完成")

    # 6. 创建压缩包
    print()
    print("[6/6] 创建压缩包...")
    zip_path = os.path.join(backup_dir, f"{timestamp}.zip")

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(backup_path):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, backup_path)
                try:
                    zipf.write(file_path, arcname)
                except Exception as e:
                    print(f"    警告: 跳过 {file} ({e})")

    # 清理临时目录
    shutil.rmtree(backup_path, ignore_errors=True)

    # 输出结果
    print()
    print("=" * 50)
    print("    备份完成！")
    print("=" * 50)
    print()
    print(f"压缩文件: {zip_path}")
    zip_size = os.path.getsize(zip_path) / (1024 * 1024)
    print(f"文件大小: {zip_size:.2f} MB")
    print()

    # 询问是否打开备份目录
    try:
        response = input("是否打开备份目录？(Y/N): ").strip().upper()
        if response == "Y":
            if sys.platform == "win32":
                os.system(f'explorer "{backup_dir}"')
            elif sys.platform == "darwin":
                os.system(f"open '{backup_dir}'")
            else:
                os.system(f"xdg-open '{backup_dir}'")
    except EOFError:
        pass

if __name__ == "__main__":
    main()
