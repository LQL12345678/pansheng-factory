#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""验证导入的数据"""

import sqlite3

DB_FILE = "devices.db"

def verify_data():
    """验证导入的数据"""
    print("=" * 60)
    print("数据验证")
    print("=" * 60)
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # 统计维修记录总数
        cursor.execute("SELECT COUNT(*) FROM repairs")
        total_repairs = cursor.fetchone()[0]
        print(f"\n✓ 维修记录总数: {total_repairs} 条")
        
        # 按设备类型统计
        print(f"\n按设备类型统计:")
        cursor.execute("""
            SELECT d.type, COUNT(*) as cnt
            FROM repairs r
            JOIN devices d ON r.device_id = d.id
            GROUP BY d.type
            ORDER BY cnt DESC
        """)
        results = cursor.fetchall()
        for row in results:
            print(f"  {row[0]:<15}: {row[1]:>3} 条")
        
        # 按月份统计
        print(f"\n按月份统计:")
        cursor.execute("""
            SELECT strftime('%Y-%m', report_date) as month, COUNT(*) as cnt
            FROM repairs
            GROUP BY month
            ORDER BY month
        """)
        results = cursor.fetchall()
        for row in results:
            print(f"  {row[0]:<10}: {row[1]:>3} 条")
        
        # 按处理人统计
        print(f"\n按处理人统计:")
        cursor.execute("""
            SELECT handler, COUNT(*) as cnt
            FROM repairs
            WHERE handler IS NOT NULL AND handler != ''
            GROUP BY handler
            ORDER BY cnt DESC
        """)
        results = cursor.fetchall()
        for row in results:
            print(f"  {row[0]:<15}: {row[1]:>3} 条")
        
        # 显示前10条记录的详细信息
        print(f"\n前10条维修记录详情:")
        print(f"{'ID':<5} {'设备':<20} {'日期':<12} {'区域':<15} {'故障类型':<20} {'处理人':<10}")
        print("-" * 90)
        cursor.execute("""
            SELECT r.id, d.name, r.report_date, r.area, r.fault_type, r.handler
            FROM repairs r
            JOIN devices d ON r.device_id = d.id
            ORDER BY r.id
            LIMIT 10
        """)
        results = cursor.fetchall()
        for row in results:
            print(f"{row[0]:<5} {row[1]:<20} {row[2]:<12} {row[3] or '':<15} {row[4] or '':<20} {row[5] or '':<10}")
        
        print(f"\n✓ 数据验证完成！")
        
    except Exception as e:
        print(f"\n❌ 错误: {str(e)}")
    finally:
        conn.close()

if __name__ == "__main__":
    verify_data()
