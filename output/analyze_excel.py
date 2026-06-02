import pandas as pd
import openpyxl

file_path = r'C:/Users/Admin/Desktop/设备异常记录数据.xlsx'

# 先用openpyxl读取原始内容
wb = openpyxl.load_workbook(file_path, data_only=True)
sheet = wb.active

print(f"工作表名称：{sheet.title}")
print(f"数据范围：{sheet.dimensions}")
print(f"\n前20行原始内容：")
for row in sheet.iter_rows(min_row=1, max_row=20, values_only=True):
    print(row)

# 再用pandas读取，不将第一行作为表头
print(f"\n\n=== 使用pandas读取（无表头）===")
df = pd.read_excel(file_path, sheet_name=0, header=None)
print(f"数据形状：{df.shape[0]}行 × {df.shape[1]}列")
print(f"\n前10行数据：")
print(df.head(10))

# 保存到CSV以便查看
df.to_csv(r'C:/Users/Admin/WorkBuddy/2026-05-10-task-1/output/设备异常记录_原始.csv', 
          index=False, header=False, encoding='utf-8-sig')
print(f"\n原始数据已保存到：C:/Users/Admin/WorkBuddy/2026-05-10-task-1/output/设备异常记录_原始.csv")
