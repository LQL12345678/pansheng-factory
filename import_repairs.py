#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
设备维修记录导入脚本 - 方案B：区域+设备类型自动匹配
支持预览和手动调整匹配结果

Excel文件结构（设备异常记录数据.xlsx）：
  - 前8行为统计信息
  - 第9行（索引8）为列标题
  - 列名：序号、故障日期、线体、提报人、异常区域、异常设备、异常现象、异常原因、处理方式、处理时长、停线时长、处理进度、处理人
"""

import pandas as pd
import sqlite3
import os
from datetime import datetime

# 配置
EXCEL_FILE = r"C:\Users\Admin\Desktop\设备异常记录数据.xlsx"
DB_FILE = "devices.db"
PREVIEW_FILE = "import_preview.xlsx"

def connect_db():
    """连接数据库"""
    return sqlite3.connect(DB_FILE)

def load_devices():
    """加载所有设备，建立匹配字典"""
    conn = connect_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT id, name, line, area, type 
        FROM devices 
        WHERE status = 'active'
    """)
    
    devices = cursor.fetchall()
    conn.close()
    
    # 构建匹配键
    device_map = {}
    
    # 按类型+线体索引: (type, line) -> [device_ids]
    type_line_map = {}
    
    # 按类型索引: type -> [device_ids]
    type_map = {}
    
    for dev in devices:
        dev_id, name, line, area, dev_type = dev
        
        # 精确匹配: (line, area, name)
        key1 = (line, area, name)
        device_map[key1] = dev_id
        
        # 区域+设备名匹配
        key2 = (area, name)
        if key2 not in device_map:
            device_map[key2] = dev_id
        
        # 设备名单独匹配
        if name not in device_map:
            device_map[name] = dev_id
        
        # 按类型+线体索引
        if dev_type and line:
            key3 = (dev_type, line)
            if key3 not in type_line_map:
                type_line_map[key3] = []
            type_line_map[key3].append(dev_id)
        
        # 按类型索引
        if dev_type:
            if dev_type not in type_map:
                type_map[dev_type] = []
            type_map[dev_type].append(dev_id)
    
    return devices, device_map, type_line_map, type_map

def normalize_value(val):
    """标准化单元格值"""
    if pd.isna(val):
        return ""
    return str(val).strip()

def normalize_line(line):
    """标准化线体格式：1 -> 1线, 2 -> 2线, VIP -> VIP"""
    if not line:
        return ""
    line = str(line).strip()
    # 如果已经是"X线"格式，直接返回
    if line.endswith('线') or line == 'VIP':
        return line
    # 否则添加"线"后缀
    return line + '线'

def match_device(row, device_map, type_line_map, type_map):
    """
    根据Excel行数据匹配设备
    匹配优先级：
    1. (line, area, name) 精确匹配
    2. (area, name) 区域+设备名
    3. name 仅设备名
    4. (type, line) 类型+线体（标准化后）
    5. type 仅类型
    6. 模糊匹配
    """
    area = normalize_value(row.get('异常区域', ''))
    device_name = normalize_value(row.get('异常设备', ''))
    line = normalize_line(row.get('线体', ''))  # 标准化线体格式
    
    # 尝试1：精确匹配 (line, area, device_name)
    
    key1 = (line, area, device_name)
    if key1 in device_map:
        return device_map[key1], "精确匹配(line+area+name)", 100
    
    # 尝试2：(area, device_name)
    
    key2 = (area, device_name)
    if key2 in device_map:
        return device_map[key2], "区域+设备名(area+name)", 80
    
    # 尝试3：只匹配设备名
    
    if device_name in device_map:
        return device_map[device_name], "仅设备名(name)", 60
    
    # 尝试4：按类型+线体匹配
    
    if device_name in type_map and line:
        key4 = (device_name, line)
        if key4 in type_line_map:
            return type_line_map[key4][0], f"类型+线体匹配({device_name},{line})", 90
    
    # 尝试5：按类型匹配（Excel中的"异常设备"可能是类型名）
    
    if device_name in type_map:
        # 返回该类型的第一个设备
        return type_map[device_name][0], f"按类型匹配({device_name})", 50
    
    # 尝试6：模糊匹配设备名
    
    for key, dev_id in device_map.items():
        if isinstance(key, str):
            if device_name in key or key in device_name:
                return dev_id, "设备名模糊匹配", 40
    
    # 尝试7：模糊匹配类型
    
    for typ, dev_ids in type_map.items():
        if device_name in typ or typ in device_name:
            return dev_ids[0], f"类型模糊匹配({typ})", 30
    
    # 无法匹配
    
    return None, "未匹配", 0

def generate_preview():
    """生成预览文件，供用户检查和修改"""
    print("=" * 60)
    print("步骤1：生成导入预览文件")
    print("=" * 60)
    
    # 读取Excel（跳过前8行，第9行作为标题）
    print(f"\n正在读取Excel文件: {EXCEL_FILE}")
    df = pd.read_excel(EXCEL_FILE, skiprows=8)  # 跳过前8行
    print(f"✓ 读取成功，共 {len(df)} 条记录")
    print(f"  列名: {df.columns.tolist()}")
    
    # 加载设备数据
    print("\n正在加载设备数据...")
    devices, device_map, type_line_map, type_map = load_devices()
    print(f"✓ 加载成功，共 {len(devices)} 个活跃设备")
    
    # 匹配设备
    print("\n正在匹配设备...")
    results = []
    matched_count = 0
    unmatched_count = 0
    
    for idx, row in df.iterrows():
        device_id, match_type, confidence = match_device(row, device_map, type_line_map, type_map)
        
        # 提取Excel字段
        result = {
            '序号': row.get('序号', ''),
            'Excel_故障日期': row.get('故障日期', ''),
            'Excel_线体': normalize_value(row.get('线体', '')),
            'Excel_提报人': normalize_value(row.get('提报人', '')),
            'Excel_异常区域': normalize_value(row.get('异常区域', '')),
            'Excel_异常设备': normalize_value(row.get('异常设备', '')),
            'Excel_异常现象': normalize_value(row.get('异常现象', '')),
            'Excel_异常原因': normalize_value(row.get('异常原因', '')),
            'Excel_处理方式': normalize_value(row.get('处理方式', '')),
            'Excel_处理时长': row.get('处理时长', 0),
            'Excel_停线时长': row.get('停线时长', 0),
            'Excel_处理进度': normalize_value(row.get('处理进度', '')),
            'Excel_处理人': normalize_value(row.get('处理人', '')),
            
            # 匹配结果
            '匹配设备ID': device_id if device_id else '',
            '匹配方式': match_type,
            '匹配置信度': confidence,
            
            # 用户可编辑字段
            '用户确认设备ID': device_id if device_id else '',  # 用户可以修改
            '是否导入': '是' if device_id else '否',  # 用户可以修改
            '备注': '' if device_id else '请手动指定设备ID或填写设备编号'
        }
        
        results.append(result)
        
        if device_id:
            matched_count += 1
        else:
            unmatched_count += 1
    
    # 保存预览文件
    preview_df = pd.DataFrame(results)
    preview_df.to_excel(PREVIEW_FILE, index=False)
    
    print(f"\n✓ 预览文件已生成: {PREVIEW_FILE}")
    print(f"  匹配成功: {matched_count} 条")
    print(f"  匹配失败: {unmatched_count} 条")
    print(f"\n请检查预览文件，必要时修改以下列：")
    print(f"  - '用户确认设备ID': 修改匹配错误的设备ID")
    print(f"  - '是否导入': 改为'否'可跳过该记录")
    print(f"  - '备注': 添加备注信息")
    print(f"\n修改完成后，运行: python import_repairs.py import")

def import_from_preview():
    """从预览文件读取并最终导入数据库"""
    print("=" * 60)
    print("步骤2：从预览文件导入数据库")
    print("=" * 60)
    
    if not os.path.exists(PREVIEW_FILE):
        print(f"❌ 错误：找不到预览文件 {PREVIEW_FILE}")
        print("请先运行: python import_repairs.py preview")
        return
    
    # 读取预览文件
    print(f"\n正在读取预览文件: {PREVIEW_FILE}")
    preview_df = pd.read_excel(PREVIEW_FILE)
    print(f"✓ 读取成功，共 {len(preview_df)} 条记录")
    
    # 筛选要导入的记录
    to_import = preview_df[preview_df['是否导入'] == '是']
    print(f"✓ 待导入记录: {len(to_import)} 条")
    
    if len(to_import) == 0:
        print("⚠ 没有需要导入的记录")
        return
    
    # 连接数据库
    conn = connect_db()
    cursor = conn.cursor()
    
    # 开始导入
    print("\n开始导入...")
    success_count = 0
    error_count = 0
    
    for idx, row in to_import.iterrows():
        try:
            # 获取设备ID（优先使用用户确认的ID）
            device_id = row['用户确认设备ID'] if pd.notna(row['用户确认设备ID']) and row['用户确认设备ID'] != '' else row['匹配设备ID']
            
            if not device_id:
                print(f"  ⚠ 跳过记录 {row['序号']}: 设备ID为空")
                error_count += 1
                continue
            
            # 转换日期格式
            date_val = row['Excel_故障日期']
            if pd.isna(date_val):
                continue
            
            if isinstance(date_val, str):
                report_date = datetime.strptime(date_val, '%Y-%m-%d').strftime('%Y-%m-%d')
            else:
                report_date = date_val.strftime('%Y-%m-%d')
            
            # 插入数据
            cursor.execute("""
                INSERT INTO repairs (
                    device_id, report_date, line, reporter, area, 
                    fault_type, problem_desc, solution, handler, stop_duration_minutes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                int(device_id),
                report_date,
                normalize_value(row['Excel_线体']),
                normalize_value(row['Excel_提报人']),
                normalize_value(row['Excel_异常区域']),
                normalize_value(row['Excel_异常现象']),  # 异常现象 → fault_type
                normalize_value(row['Excel_异常原因']),  # 异常原因 → problem_desc
                normalize_value(row['Excel_处理方式']),
                normalize_value(row['Excel_处理人']),
                float(row['Excel_停线时长']) if pd.notna(row['Excel_停线时长']) and row['Excel_停线时长'] != '' else None
            ))
            
            success_count += 1
            print(f"  ✓ 记录 {row['序号']} 导入成功 (设备ID={device_id}, {row['匹配方式']})")
            
        except Exception as e:
            print(f"  ❌ 记录 {row['序号']} 导入失败: {str(e)}")
            error_count += 1
    
    # 提交事务
    conn.commit()
    conn.close()
    
    print(f"\n✓ 导入完成！")
    print(f"  成功: {success_count} 条")
    print(f"  失败: {error_count} 条")

def main():
    """主函数"""
    print("\n" + "=" * 60)
    print("设备维修记录导入工具 - 方案B（区域+设备类型匹配）")
    print("=" * 60)
    print("\n请选择操作：")
    print("  1. 生成预览文件（步骤1）")
    print("  2. 从预览文件导入数据库（步骤2）")
    print("  0. 退出")
    
    choice = input("\n请输入选项 (0/1/2): ").strip()
    
    if choice == '1':
        generate_preview()
    elif choice == '2':
        import_from_preview()
    elif choice == '0':
        print("退出程序")
    else:
        print("无效选项")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == 'preview':
            generate_preview()
        elif sys.argv[1] == 'import':
            import_from_preview()
        else:
            print("用法: python import_repairs.py [preview|import]")
    else:
        main()
