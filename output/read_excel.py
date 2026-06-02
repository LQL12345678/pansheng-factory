import pandas as pd
import json

# 读取Excel文件
file_path = r'C:/Users/Admin/Desktop/设备异常记录数据.xlsx'

# 读取所有sheet
xl_file = pd.ExcelFile(file_path)
print(f"Excel文件包含以下工作表：{xl_file.sheet_names}")

# 读取第一个工作表
df = pd.read_excel(file_path, sheet_name=0)

# 输出基本信息
print(f"\n数据形状：{df.shape[0]}行 × {df.shape[1]}列")
print(f"\n列名：")
for i, col in enumerate(df.columns):
    print(f"  {i+1}. {col}")

# 输出前5行数据
print(f"\n前5行数据：")
print(df.head())

# 输出数据类型
print(f"\n各列数据类型：")
print(df.dtypes)

# 保存到临时文件以便后续处理
df.to_csv(r'C:/Users/Admin/WorkBuddy/2026-05-10-task-1/output/设备异常记录_预览.csv', index=False, encoding='utf-8-sig')
print(f"\n数据已保存到：C:/Users/Admin/WorkBuddy/2026-05-10-task-1/output/设备异常记录_预览.csv")
