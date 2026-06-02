#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据库初始化脚本 - 创建设备管理系统的表结构
"""

import sqlite3
import os

DB_FILE = "devices.db"

def init_database():
    """初始化数据库，创建所有表"""
    print("=" * 60)
    print("数据库初始化")
    print("=" * 60)
    
    # 如果数据库文件存在且非空，先备份
    if os.path.exists(DB_FILE) and os.path.getsize(DB_FILE) > 0:
        backup_file = DB_FILE + ".backup"
        print(f"\n⚠ 数据库文件已存在，备份为: {backup_file}")
        import shutil
        shutil.copy2(DB_FILE, backup_file)
    
    # 连接数据库（不存在则创建）
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # 创建设备表
        print("\n正在创建设备表(devices)...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS devices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,                  -- 设备名称
                code TEXT UNIQUE,                   -- 设备编号
                line TEXT,                          -- 线体（1线、2线等）
                area TEXT,                          -- 区域（车间、区域）
                type TEXT,                          -- 设备类型（提升机、平移机等）
                status TEXT DEFAULT 'active',       -- 状态（active, inactive）
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("✓ 设备表创建成功")
        
        # 创建维修记录表
        print("\n正在创建维修记录表(repairs)...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS repairs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id INTEGER NOT NULL,          -- 关联设备ID
                report_date DATE NOT NULL,          -- 故障日期
                line TEXT,                          -- 线体
                reporter TEXT,                      -- 提报人
                area TEXT,                          -- 异常区域
                fault_type TEXT,                    -- 异常类型/现象
                problem_desc TEXT,                  -- 问题描述/异常原因
                solution TEXT,                      -- 处理方式
                handler TEXT,                       -- 处理人
                stop_duration_minutes REAL,         -- 停线时长（分钟）
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_id) REFERENCES devices(id)
            )
        """)
        print("✓ 维修记录表创建成功")
        
        # 创建索引
        print("\n正在创建索引...")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_repairs_device_id ON repairs(device_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_repairs_report_date ON repairs(report_date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_devices_line ON devices(line)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_devices_area ON devices(area)")
        print("✓ 索引创建成功")
        
        # 提交事务
        conn.commit()
        print("\n✓ 数据库初始化完成！")
        
        # 显示表结构
        print("\n" + "=" * 60)
        print("表结构:")
        print("=" * 60)
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        
        for table in tables:
            table_name = table[0]
            print(f"\n【{table_name}】")
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = cursor.fetchall()
            for col in columns:
                print(f"  {col[1]:20} {col[2]:15} {'NOT NULL' if col[3] else 'NULL'}")
        
    except Exception as e:
        print(f"\n❌ 错误: {str(e)}")
        conn.rollback()
    finally:
        conn.close()

def import_sample_devices():
    """导入示例设备数据（用于测试匹配）"""
    print("\n" + "=" * 60)
    print("导入示例设备数据")
    print("=" * 60)
    
    # 示例设备数据（根据Excel中的设备类型）
    sample_devices = [
        ("提升机01", "SH-001", "1线", "A区", "提升机", "active"),
        ("提升机02", "SH-002", "2线", "A区", "提升机", "active"),
        ("平移机01", "QY-001", "1线", "B区", "平移机", "active"),
        ("平移机02", "QY-002", "2线", "B区", "平移机", "active"),
        ("倍速链01", "BS-001", "1线", "A区", "倍速链", "active"),
        ("倍速链02", "BS-002", "2线", "A区", "倍速链", "active"),
        ("皮带线01", "PD-001", "1线", "C区", "皮带线", "active"),
        ("阻挡器01", "ZD-001", "1线", "A区", "阻挡器", "active"),
        ("打印机01", "DY-001", "办公区", "办公室", "打印机", "active"),
        ("AGV01", "AGV-001", "", "仓库", "AGV", "active"),
    ]
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        cursor.executemany("""
            INSERT OR IGNORE INTO devices (name, code, line, area, type, status)
            VALUES (?, ?, ?, ?, ?, ?)
        """, sample_devices)
        
        conn.commit()
        print(f"✓ 成功导入 {len(sample_devices)} 个示例设备")
        
        # 显示导入的设备
        cursor.execute("SELECT id, name, line, area, type FROM devices")
        devices = cursor.fetchall()
        
        print(f"\n当前设备列表（共{len(devices)}个）:")
        print(f"{'ID':<5} {'设备名称':<15} {'线体':<10} {'区域':<10} {'类型':<10}")
        print("-" * 60)
        for dev in devices:
            print(f"{dev[0]:<5} {dev[1]:<15} {dev[2] or '':<10} {dev[3] or '':<10} {dev[4]:<10}")
        
    except Exception as e:
        print(f"❌ 错误: {str(e)}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    import sys
    
    init_database()
    
    if len(sys.argv) > 1 and sys.argv[1] == '--with-samples':
        import_sample_devices()
    else:
        print("\n💡 提示: 运行 `python init_db.py --with-samples` 可导入示例设备数据用于测试")
