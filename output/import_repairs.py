import pandas as pd
import requests
import json
from datetime import datetime

# 读取Excel文件
file_path = r'C:/Users/Admin/Desktop/设备异常记录数据.xlsx'

# 读取详细数据（从第9行开始，第8行是表头）
df = pd.read_excel(file_path, sheet_name=0, header=None, skiprows=8)

# 重命名列（根据第8行的内容）
df.columns = ['序号', '故障日期', '线体', '提报人', '异常区域', '异常设备', '异常现象', '异常原因', '处理方式', '处理时长', '停线时长', '处理进度', '处理人']

# 移除空行
df = df.dropna(subset=['故障日期'])

print(f"共读取 {len(df)} 条记录")
print(f"\n前3条记录：")
print(df.head(3))

# 获取设备列表，建立设备名称到ID的映射
print("\n正在获取设备列表...")
response = requests.get('http://localhost:3001/api/devices')
devices = response.json()

# 创建设备名称到ID的映射
device_map = {}
for d in devices:
    # 使用设备名称作为键
    device_map[d['name']] = d['id']
    # 也使用设备编号作为键
    device_map[d['device_no']] = d['id']

print(f"已获取 {len(devices)} 个设备")

# 转换数据并导入
print("\n开始导入数据...")
success_count = 0
failed_count = 0

for index, row in df.iterrows():
    try:
        # 查找设备ID
        device_name = row['异常设备']
        device_id = device_map.get(device_name)
        
        if not device_id:
            print(f"⚠️ 第{index+9}行：找不到设备 '{device_name}'，跳过")
            failed_count += 1
            continue
        
        # 转换日期格式
        fault_date = pd.to_datetime(row['故障日期']).strftime('%Y-%m-%d')
        
        # 构建数据
        data = {
            'device_id': int(device_id),
            'line': row['线体'] if pd.notna(row['线体']) else None,
            'reporter': row['提报人'] if pd.notna(row['提报人']) else None,
            'area': row['异常区域'] if pd.notna(row['异常区域']) else None,
            'fault_desc': row['异常现象'] if pd.notna(row['异常现象']) else '',
            'fault_type': None,  # Excel中没有这个字段
            'fault_cause': row['异常原因'] if pd.notna(row['异常原因']) else None,
            'solution': row['处理方式'] if pd.notna(row['处理方式']) else None,
            'parts_used': None,  # Excel中没有这个字段
            'repairman': row['处理人'] if pd.notna(row['处理人']) else '',
            'duration_minutes': int(row['处理时长']) if pd.notna(row['处理时长']) else None,
            'stop_duration_minutes': int(row['停线时长']) if pd.notna(row['停线时长']) else None,
            'status': '已完成' if row['处理进度'] == '已完结' else '处理中',
            'remarks': None
        }
        
        # 发送POST请求
        response = requests.post('http://localhost:3001/api/repairs', json=data)
        
        if response.status_code == 200:
            success_count += 1
            if success_count % 10 == 0:
                print(f"已导入 {success_count} 条记录...")
        else:
            print(f"❌ 第{index+9}行导入失败：{response.text}")
            failed_count += 1
            
    except Exception as e:
        print(f"❌ 第{index+9}行处理出错：{str(e)}")
        failed_count += 1

print(f"\n✅ 导入完成！")
print(f"   成功：{success_count} 条")
print(f"   失败：{failed_count} 条")
