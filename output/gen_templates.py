from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
import os

OUT = r"C:\Users\Admin\WorkBuddy\2026-05-10-task-1\output"

HEADER_FILL = PatternFill("solid", start_color="534AB7")
HEADER_FONT = Font(name="Arial", bold=True, color="FFFFFF", size=11)
EXAMPLE_FILL = PatternFill("solid", start_color="F1EFE8")
EXAMPLE_FONT = Font(name="Arial", size=10, color="888780")
DATA_FONT = Font(name="Arial", size=10)
REQUIRED_FILL = PatternFill("solid", start_color="FCEBEB")
OPTIONAL_FILL = PatternFill("solid", start_color="E6F1FB")
NOTE_FONT = Font(name="Arial", size=9, color="5F5E5A", italic=True)

thin = Side(style="thin", color="D3D1C7")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)

def style_header(ws, row, cols):
    for col in range(1, cols + 1):
        c = ws.cell(row=row, column=col)
        c.font = HEADER_FONT
        c.fill = HEADER_FILL
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = BORDER

def style_example(ws, row, cols):
    for col in range(1, cols + 1):
        c = ws.cell(row=row, column=col)
        c.font = EXAMPLE_FONT
        c.fill = EXAMPLE_FILL
        c.alignment = Alignment(vertical="center", wrap_text=True)
        c.border = BORDER

def style_data_rows(ws, start_row, end_row, cols):
    fills = [PatternFill("solid", start_color="FFFFFF"), PatternFill("solid", start_color="F8F8F6")]
    for row in range(start_row, end_row + 1):
        f = fills[(row - start_row) % 2]
        for col in range(1, cols + 1):
            c = ws.cell(row=row, column=col)
            c.font = DATA_FONT
            c.fill = f
            c.alignment = Alignment(vertical="center", wrap_text=True)
            c.border = BORDER

def add_legend(ws, row, cols):
    ws.row_dimensions[row].height = 18
    note = ws.cell(row=row, column=1)
    note.value = "【填写说明】红色底色=必填项  蓝色底色=可选项  第2行为示例数据，实际填写时请从第3行开始"
    note.font = NOTE_FONT
    note.alignment = Alignment(vertical="center")
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=cols)

def add_required_mark(ws, header_row, required_cols, total_cols):
    for col in range(1, total_cols + 1):
        c = ws.cell(row=header_row - 1, column=col)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = BORDER
        c.font = Font(name="Arial", size=9)
        if col in required_cols:
            c.value = "必填"
            c.fill = REQUIRED_FILL
            c.font = Font(name="Arial", size=9, color="A32D2D", bold=True)
        else:
            c.value = "可选"
            c.fill = OPTIONAL_FILL
            c.font = Font(name="Arial", size=9, color="185FA5")


# ============================================================
# 模板1: 设备基础档案
# ============================================================
def build_device_template():
    wb = Workbook()
    ws = wb.active
    ws.title = "设备台账"

    headers = ["设备编号", "设备名称", "设备类别", "型号规格", "安装位置",
               "所属产线", "供应商", "投用日期", "保养周期(天)", "责任人",
               "设备状态", "备注"]
    required = {1, 2, 3, 5}
    example = ["EQ-001", "一线平移机", "平移机", "TX-500A", "BD线1号位",
                "BD生产线", "某某机械有限公司", "2024-03-15", "30", "李庆良",
                "正常", ""]

    ws.row_dimensions[1].height = 20
    add_legend(ws, 1, len(headers))

    ws.row_dimensions[2].height = 22
    add_required_mark(ws, 3, required, len(headers))

    ws.row_dimensions[3].height = 30
    for i, h in enumerate(headers, 1):
        ws.cell(row=3, column=i).value = h
    style_header(ws, 3, len(headers))

    ws.row_dimensions[4].height = 22
    for i, v in enumerate(example, 1):
        ws.cell(row=4, column=i).value = v
    style_example(ws, 4, len(headers))

    style_data_rows(ws, 5, 54, len(headers))

    dv_status = DataValidation(type="list", formula1='"正常,维修中,停用,报废"', allow_blank=True)
    dv_status.sqref = "K5:K54"
    ws.add_data_validation(dv_status)

    dv_cat = DataValidation(type="list", formula1='"提升机,平移机,倍速链,皮带线,阻挡器,打印机,AGV,空压机,冲压机,其他"', allow_blank=True)
    dv_cat.sqref = "C5:C54"
    ws.add_data_validation(dv_cat)

    widths = [12, 18, 12, 14, 14, 12, 20, 14, 14, 10, 10, 16]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # 说明sheet
    ws2 = wb.create_sheet("字段说明")
    explain = [
        ["字段名", "是否必填", "数据类型", "说明"],
        ["设备编号", "必填", "文本", "自定义编号，全厂唯一，如EQ-001"],
        ["设备名称", "必填", "文本", "设备的通用名称"],
        ["设备类别", "必填", "下拉", "从下拉列表选择，可在系统中自定义新增类别"],
        ["型号规格", "可选", "文本", "设备铭牌上的型号"],
        ["安装位置", "必填", "文本", "具体到产线+工位，如BD线1号位"],
        ["所属产线", "可选", "文本", "如BD生产线、1线老化房"],
        ["供应商", "可选", "文本", "设备采购的供应商名称"],
        ["投用日期", "可选", "日期", "格式：YYYY-MM-DD"],
        ["保养周期(天)", "可选", "数字", "系统将根据此字段自动生成保养提醒，如30表示每30天保养一次"],
        ["责任人", "可选", "文本", "日常维护负责人姓名"],
        ["设备状态", "可选", "下拉", "正常/维修中/停用/报废"],
        ["备注", "可选", "文本", "其他补充信息"],
    ]
    for row_data in explain:
        ws2.append(row_data)
    for col in range(1, 5):
        c = ws2.cell(row=1, column=col)
        c.font = HEADER_FONT
        c.fill = HEADER_FILL
        c.alignment = Alignment(horizontal="center", vertical="center")
    ws2.column_dimensions["A"].width = 18
    ws2.column_dimensions["B"].width = 10
    ws2.column_dimensions["C"].width = 10
    ws2.column_dimensions["D"].width = 50

    wb.save(os.path.join(OUT, "模板1_设备基础档案.xlsx"))
    print("模板1 done")


# ============================================================
# 模板2: 故障维修记录
# ============================================================
def build_repair_template():
    wb = Workbook()
    ws = wb.active
    ws.title = "故障维修记录"

    headers = ["工单编号", "报修日期", "报修时间", "设备编号", "设备名称",
               "故障现象描述", "故障类型", "故障原因", "处理方式",
               "使用零件", "维修人员", "接单时间", "完成时间", "维修用时(分钟)", "工单状态", "备注"]
    required = {2, 4, 6, 11}
    example = ["WO-2026-001", "2026-05-08", "09:30", "EQ-001", "一线平移机",
                "皮带掉落，设备停机", "机械故障", "皮带磨损断裂", "更换皮带",
                "皮带×1", "李庆良", "09:45", "11:20", "=IF(AND(L5<>\"\",M5<>\"\"),\
(TIMEVALUE(M5)-TIMEVALUE(L5))*1440,\"\")", "已完成", ""]

    ws.row_dimensions[1].height = 20
    add_legend(ws, 1, len(headers))
    ws.row_dimensions[2].height = 22
    add_required_mark(ws, 3, required, len(headers))
    ws.row_dimensions[3].height = 30
    for i, h in enumerate(headers, 1):
        ws.cell(row=3, column=i).value = h
    style_header(ws, 3, len(headers))
    ws.row_dimensions[4].height = 22
    for i, v in enumerate(example, 1):
        ws.cell(row=4, column=i).value = v
    style_example(ws, 4, len(headers))
    style_data_rows(ws, 5, 104, len(headers))

    dv_type = DataValidation(type="list", formula1='"机械故障,电气故障,气动故障,软件故障,人为损坏,磨损老化,其他"', allow_blank=True)
    dv_type.sqref = "G5:G104"
    ws.add_data_validation(dv_type)

    dv_status = DataValidation(type="list", formula1='"待处理,处理中,已完成,挂起"', allow_blank=True)
    dv_status.sqref = "O5:O104"
    ws.add_data_validation(dv_status)

    widths = [14, 12, 10, 12, 14, 24, 12, 16, 20, 14, 10, 10, 10, 16, 10, 14]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws2 = wb.create_sheet("字段说明")
    explain = [
        ["字段名", "是否必填", "说明"],
        ["工单编号", "可选", "留空则系统自动生成，格式WO-YYYY-NNN"],
        ["报修日期", "必填", "格式YYYY-MM-DD"],
        ["报修时间", "可选", "格式HH:MM，用于计算响应时间"],
        ["设备编号", "必填", "对应设备台账中的设备编号"],
        ["设备名称", "可选", "可留空，系统自动从设备编号关联"],
        ["故障现象描述", "必填", "详细描述故障现象"],
        ["故障类型", "可选", "从下拉选择"],
        ["故障原因", "可选", "分析得出的故障根因"],
        ["处理方式", "可选", "具体的维修操作内容"],
        ["使用零件", "可选", "格式：零件名×数量，多个用分号分隔"],
        ["维修人员", "必填", "实际维修人员姓名"],
        ["接单时间", "可选", "格式HH:MM"],
        ["完成时间", "可选", "格式HH:MM"],
        ["维修用时(分钟)", "可选", "系统自动计算，也可手动填写"],
        ["工单状态", "可选", "已完成/处理中/待处理/挂起"],
        ["备注", "可选", "其他补充"],
    ]
    for row_data in explain:
        ws2.append(row_data)
    for col in range(1, 4):
        c = ws2.cell(row=1, column=col)
        c.font = HEADER_FONT
        c.fill = HEADER_FILL
        c.alignment = Alignment(horizontal="center", vertical="center")
    ws2.column_dimensions["A"].width = 18
    ws2.column_dimensions["B"].width = 10
    ws2.column_dimensions["C"].width = 50

    wb.save(os.path.join(OUT, "模板2_故障维修记录.xlsx"))
    print("模板2 done")


# ============================================================
# 模板3: 零部件库存
# ============================================================
def build_parts_template():
    wb = Workbook()
    ws = wb.active
    ws.title = "零部件台账"

    headers = ["备件编号", "备件名称", "规格型号", "品牌", "适用设备",
               "存放位置", "当前库存", "安全库存(预警值)", "计量单位",
               "单价(元)", "供应商", "采购周期(天)", "备注"]
    required = {2, 3, 6, 7, 8}
    example = ["PT-001", "皮带", "A型 50mm×500mm", "三角", "EQ-001;EQ-005",
                "仓库B-03", "12", "5", "条",
                "28.5", "XX传动件供应商", "7", ""]

    ws.row_dimensions[1].height = 20
    add_legend(ws, 1, len(headers))
    ws.row_dimensions[2].height = 22
    add_required_mark(ws, 3, required, len(headers))
    ws.row_dimensions[3].height = 30
    for i, h in enumerate(headers, 1):
        ws.cell(row=3, column=i).value = h
    style_header(ws, 3, len(headers))
    ws.row_dimensions[4].height = 22
    for i, v in enumerate(example, 1):
        ws.cell(row=4, column=i).value = v
    style_example(ws, 4, len(headers))
    style_data_rows(ws, 5, 104, len(headers))

    dv_unit = DataValidation(type="list", formula1='"个,条,根,套,箱,卷,升,千克,米"', allow_blank=True)
    dv_unit.sqref = "I5:I104"
    ws.add_data_validation(dv_unit)

    widths = [12, 18, 18, 12, 20, 14, 12, 16, 10, 10, 20, 14, 16]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # 出入库记录sheet
    ws2 = wb.create_sheet("出入库记录")
    headers2 = ["记录编号", "日期", "备件编号", "备件名称", "操作类型",
                "数量", "关联工单号", "经手人", "备注"]
    required2 = {2, 3, 5, 6}
    example2 = ["IO-001", "2026-05-08", "PT-001", "皮带", "出库",
                 "1", "WO-2026-001", "李庆良", "更换一线平移机皮带"]

    ws2.row_dimensions[1].height = 20
    add_legend(ws2, 1, len(headers2))
    ws2.row_dimensions[2].height = 22
    add_required_mark(ws2, 3, required2, len(headers2))
    ws2.row_dimensions[3].height = 30
    for i, h in enumerate(headers2, 1):
        ws2.cell(row=3, column=i).value = h
    style_header(ws2, 3, len(headers2))
    ws2.row_dimensions[4].height = 22
    for i, v in enumerate(example2, 1):
        ws2.cell(row=4, column=i).value = v
    style_example(ws2, 4, len(headers2))
    style_data_rows(ws2, 5, 104, len(headers2))

    dv_op = DataValidation(type="list", formula1='"入库,出库,盘点调整,报废"', allow_blank=True)
    dv_op.sqref = "E5:E104"
    ws2.add_data_validation(dv_op)

    widths2 = [12, 12, 12, 16, 12, 8, 14, 10, 20]
    for i, w in enumerate(widths2, 1):
        ws2.column_dimensions[get_column_letter(i)].width = w

    ws3 = wb.create_sheet("字段说明")
    explain = [
        ["字段名", "所在表", "是否必填", "说明"],
        ["备件编号", "零部件台账", "可选", "留空则系统自动生成，格式PT-NNN"],
        ["备件名称", "零部件台账", "必填", "零部件名称"],
        ["规格型号", "零部件台账", "必填", "精确规格，用于采购时参考"],
        ["适用设备", "零部件台账", "可选", "多个设备用分号分隔"],
        ["存放位置", "零部件台账", "必填", "如仓库B-03"],
        ["当前库存", "零部件台账", "必填", "导入时的当前实际库存数量"],
        ["安全库存(预警值)", "零部件台账", "必填", "低于此数量时系统自动发送预警通知"],
        ["操作类型", "出入库记录", "必填", "入库/出库/盘点调整/报废"],
        ["关联工单号", "出入库记录", "可选", "出库时填写对应的维修工单号，用于追溯"],
    ]
    for row_data in explain:
        ws3.append(row_data)
    for col in range(1, 5):
        c = ws3.cell(row=1, column=col)
        c.font = HEADER_FONT
        c.fill = HEADER_FILL
        c.alignment = Alignment(horizontal="center", vertical="center")
    ws3.column_dimensions["A"].width = 16
    ws3.column_dimensions["B"].width = 14
    ws3.column_dimensions["C"].width = 10
    ws3.column_dimensions["D"].width = 50

    wb.save(os.path.join(OUT, "模板3_零部件库存.xlsx"))
    print("模板3 done")


# ============================================================
# 模板4: 保养计划
# ============================================================
def build_maintenance_template():
    wb = Workbook()
    ws = wb.active
    ws.title = "保养计划"

    headers = ["计划编号", "设备编号", "设备名称", "保养类型", "保养项目描述",
               "计划日期", "负责人", "企业微信ID", "所需备件", "预计用时(分钟)",
               "实际执行日期", "执行状态", "执行人", "备注"]
    required = {2, 4, 5, 6, 7}
    example = ["MP-2026-001", "EQ-001", "一线平移机", "定期保养", "检查皮带张紧度，清洁传动部件，加注润滑油",
                "2026-05-15", "李庆良", "liqingliang", "润滑油×0.5L", "45",
                "", "待执行", "", ""]

    ws.row_dimensions[1].height = 20
    add_legend(ws, 1, len(headers))
    ws.row_dimensions[2].height = 22
    add_required_mark(ws, 3, required, len(headers))
    ws.row_dimensions[3].height = 30
    for i, h in enumerate(headers, 1):
        ws.cell(row=3, column=i).value = h
    style_header(ws, 3, len(headers))
    ws.row_dimensions[4].height = 22
    for i, v in enumerate(example, 1):
        ws.cell(row=4, column=i).value = v
    style_example(ws, 4, len(headers))
    style_data_rows(ws, 5, 104, len(headers))

    dv_type = DataValidation(type="list", formula1='"日常点检,定期保养,年度大修,专项检查,换季保养"', allow_blank=True)
    dv_type.sqref = "D5:D104"
    ws.add_data_validation(dv_type)

    dv_status = DataValidation(type="list", formula1='"待执行,执行中,已完成,已延期,已取消"', allow_blank=True)
    dv_status.sqref = "L5:L104"
    ws.add_data_validation(dv_status)

    widths = [14, 12, 16, 12, 30, 12, 10, 16, 16, 16, 14, 10, 10, 16]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # 通知模板sheet
    ws2 = wb.create_sheet("微信通知模板")
    ws2["A1"] = "通知场景"
    ws2["B1"] = "消息模板"
    ws2["A1"].font = HEADER_FONT
    ws2["A1"].fill = HEADER_FILL
    ws2["B1"].font = HEADER_FONT
    ws2["B1"].fill = HEADER_FILL
    ws2["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws2["B1"].alignment = Alignment(horizontal="center", vertical="center")

    templates = [
        ["保养提醒", "【保养提醒】\n设备：{设备名称}（{设备编号}）\n任务：{保养项目描述}\n计划日期：{计划日期}\n负责人：{负责人}\n请及时安排处理，如需调整计划请在系统中更新。"],
        ["故障通知-主管", "【故障预警】\n报修时间：{报修时间}\n设备：{设备名称}（{安装位置}）\n故障描述：{故障现象描述}\n工单编号：{工单编号}\n请关注处理进度。"],
        ["低库存预警", "【库存预警】\n备件：{备件名称}（{规格型号}）\n当前库存：{当前库存}{计量单位}（低于安全库存{安全库存}）\n存放位置：{存放位置}\n请及时联系供应商补货。"],
        ["维修完成通知", "【维修完成】\n工单：{工单编号}\n设备：{设备名称}\n处理方式：{处理方式}\n维修人员：{维修人员}\n用时：{维修用时}分钟\n设备已恢复正常，请确认。"],
    ]
    for row_data in templates:
        ws2.append(row_data)
    ws2.column_dimensions["A"].width = 18
    ws2.column_dimensions["B"].width = 60
    for row in range(2, 6):
        ws2.row_dimensions[row].height = 60
        ws2.cell(row=row, column=2).alignment = Alignment(wrap_text=True, vertical="top")

    ws3 = wb.create_sheet("字段说明")
    explain = [
        ["字段名", "是否必填", "说明"],
        ["计划编号", "可选", "留空则系统自动生成，格式MP-YYYY-NNN"],
        ["设备编号", "必填", "对应设备台账中的设备编号"],
        ["保养类型", "必填", "从下拉选择：日常点检/定期保养/年度大修等"],
        ["保养项目描述", "必填", "详细说明此次需要执行的保养操作"],
        ["计划日期", "必填", "格式YYYY-MM-DD"],
        ["负责人", "必填", "执行此次保养的人员姓名"],
        ["企业微信ID", "必填", "负责人的企业微信账号ID，用于精准推送消息"],
        ["所需备件", "可选", "格式：零件名×数量，多个用分号分隔"],
        ["预计用时(分钟)", "可选", "预估保养所需时间"],
        ["执行状态", "可选", "待执行/执行中/已完成/已延期/已取消"],
    ]
    for row_data in explain:
        ws3.append(row_data)
    for col in range(1, 4):
        c = ws3.cell(row=1, column=col)
        c.font = HEADER_FONT
        c.fill = HEADER_FILL
        c.alignment = Alignment(horizontal="center", vertical="center")
    ws3.column_dimensions["A"].width = 18
    ws3.column_dimensions["B"].width = 10
    ws3.column_dimensions["C"].width = 55

    wb.save(os.path.join(OUT, "模板4_保养计划.xlsx"))
    print("模板4 done")


if __name__ == "__main__":
    build_device_template()
    build_repair_template()
    build_parts_template()
    build_maintenance_template()
    print("ALL DONE")
