// 初始化/重置演示数据：3 个角色账号 + 四大类 10 条器材档案 + 示例附件
import fs from 'node:fs';
import path from 'node:path';
import {
  DATA_DIR,
  FILES_DIR,
  DB_FILE,
  readDB,
  writeDB,
  nextId,
  CATEGORIES
} from './db.js';
import { hashPassword } from './auth.js';

function now() {
  return new Date().toISOString();
}

function makeAttachment(db, gearCode, name, content, mime = 'text/plain') {
  const id = nextId(db, 'file', 'F');
  fs.writeFileSync(path.join(FILES_DIR, id), content, 'utf8');
  return {
    id,
    name,
    mime,
    size: Buffer.byteLength(content, 'utf8'),
    uploadedAt: now()
  };
}

function seed() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(FILES_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) fs.rmSync(DB_FILE);
  for (const f of fs.readdirSync(FILES_DIR)) fs.rmSync(path.join(FILES_DIR, f));

  const db = readDB();
  const ts = now();

  db.meta = {
    platformName: '演播室器材档案平台',
    version: '1.0.0',
    seededAt: ts
  };

  const users = [
    { username: 'admin', password: 'admin123', realName: '王主任', role: 'admin', phone: '138-0000-0001' },
    { username: 'editor', password: 'edit123', realName: '李器材', role: 'editor', phone: '138-0000-0002' },
    { username: 'viewer', password: 'view123', realName: '张实习', role: 'viewer', phone: '138-0000-0003' }
  ];
  for (const u of users) {
    const id = nextId(db, 'user', 'U');
    db.users.push({
      id,
      username: u.username,
      realName: u.realName,
      role: u.role,
      phone: u.phone,
      active: true,
      createdAt: ts,
      ...hashPassword(u.password)
    });
  }

  const rows = [
    {
      category: 'camera',
      code: 'CAM-4K-A01',
      name: 'Sony PXW-Z280 4K 摄像机',
      brand: 'Sony',
      model: 'PXW-Z280',
      location: 'A 区器材柜 1 层',
      status: 'in_stock',
      owner: '李器材',
      ownerPhone: '138-0000-0002',
      purchaseDate: '2024-03-12',
      remark: '标配 SxS 存储卡×2、BP-U70 电池×2，导播课主力机位。',
      attachments: [
        { t: '验收清单-Z280.txt', c: 'Sony PXW-Z280 验收清单\n1. 机身序列号核对  2. CMOS 坏点检测  3. 录制功能测试\n验收人：李器材  日期：2024-03-12' },
        { t: '保修卡.txt', c: '保修卡\n型号：PXW-Z280  保修期：3 年（至 2027-03-11）\n服务热线：400-810-9000' }
      ]
    },
    {
      category: 'camera',
      code: 'CAM-4K-A02',
      name: 'Canon EOS C70 电影机',
      brand: 'Canon',
      model: 'EOS C70',
      location: 'A 区器材柜 2 层',
      status: 'borrowed',
      owner: '王主任',
      ownerPhone: '138-0000-0001',
      purchaseDate: '2023-11-02',
      remark: '借用于新闻栏目周播录制，预计月底归还。',
      attachments: [
        { t: '借用登记.txt', c: '借用登记\n借用人：新闻栏目组  借出：2026-09-20  预计归还：2026-09-30\n审批：王主任' }
      ]
    },
    {
      category: 'camera',
      code: 'CAM-PTZ-B01',
      name: 'Panasonic AW-UE100 PTZ 摄像机',
      brand: 'Panasonic',
      model: 'AW-UE100',
      location: '1 号演播室吊顶位',
      status: 'in_stock',
      owner: '李器材',
      ownerPhone: '138-0000-0002',
      purchaseDate: '2025-01-18',
      remark: '固定机位，NDI|HX 接入切换台。',
      attachments: []
    },
    {
      category: 'light',
      code: 'LGT-LED-C01',
      name: 'Aputure LS 600d Pro 聚光灯',
      brand: 'Aputure',
      model: 'LS 600d Pro',
      location: 'B 区灯架区',
      status: 'in_stock',
      owner: '赵灯光',
      ownerPhone: '138-0000-0004',
      purchaseDate: '2024-06-25',
      remark: '含 Fresnel 透镜与灯笼柔光箱。',
      attachments: [
        { t: '灯具安全检测.txt', c: '安全检测记录\n灯具外观：正常  线缆绝缘：正常  漏电流：合格\n检测：赵灯光  2026-01-10' }
      ]
    },
    {
      category: 'light',
      code: 'LGT-PNL-C02',
      name: 'Godox LP1200R 双色温平板灯',
      brand: 'Godox',
      model: 'LP1200R',
      location: 'B 区灯架区',
      status: 'repair',
      owner: '赵灯光',
      ownerPhone: '138-0000-0004',
      purchaseDate: '2023-08-30',
      remark: '调光旋钮失灵，已送修。',
      attachments: [
        { t: '维修单.txt', c: '维修工单\n故障：调光旋钮无响应  送修：2026-09-15  预计取回：2026-09-28\n维修商：星光影视设备维修中心' }
      ]
    },
    {
      category: 'audio',
      code: 'AUD-MIC-D01',
      name: 'Sennheiser MKE 600 枪式麦克风',
      brand: 'Sennheiser',
      model: 'MKE 600',
      location: 'C 区防潮柜 1 层',
      status: 'in_stock',
      owner: '孙收音',
      ownerPhone: '138-0000-0005',
      purchaseDate: '2024-09-05',
      remark: '含防风猪笼、XLR 线 3 米。',
      attachments: []
    },
    {
      category: 'audio',
      code: 'AUD-LAV-D02',
      name: 'Rode Wireless GO II 无线领夹麦',
      brand: 'Rode',
      model: 'Wireless GO II',
      location: 'C 区防潮柜 2 层',
      status: 'borrowed',
      owner: '孙收音',
      ownerPhone: '138-0000-0005',
      purchaseDate: '2025-02-14',
      remark: '一拖二套装，含充电盒。',
      attachments: [
        { t: '借用登记.txt', c: '借用登记\n借用人：访谈节目组  借出：2026-09-22  预计归还：2026-09-27' }
      ]
    },
    {
      category: 'audio',
      code: 'AUD-MXR-D03',
      name: 'Zoom F6 多轨录音机',
      brand: 'Zoom',
      model: 'F6',
      location: 'C 区防潮柜 2 层',
      status: 'in_stock',
      owner: '孙收音',
      ownerPhone: '138-0000-0005',
      purchaseDate: '2023-05-19',
      remark: '32bit 浮点录音，含 SD 卡 128G。',
      attachments: []
    },
    {
      category: 'switcher',
      code: 'SWT-ATEM-E01',
      name: 'Blackmagic ATEM Mini Extreme ISO 切换台',
      brand: 'Blackmagic Design',
      model: 'ATEM Mini Extreme ISO',
      location: '1 号演播室导播台',
      status: 'in_stock',
      owner: '周导播',
      ownerPhone: '138-0000-0006',
      purchaseDate: '2024-12-01',
      remark: '8 路 HDMI 输入，串流与 ISO 录制已配置。',
      attachments: [
        { t: '部署说明.txt', c: 'ATEM 部署说明\n输入1-4：有线机位  输入5-6：PTZ  输入7：字幕机\n推流地址已预设至校内 CDN。' }
      ]
    },
    {
      category: 'switcher',
      code: 'SWT-ATEM-E02',
      name: 'Blackmagic ATEM SDI Extreme ISO 切换台',
      brand: 'Blackmagic Design',
      model: 'ATEM SDI Extreme ISO',
      location: '2 号虚拟演播室',
      status: 'scrapped',
      owner: '周导播',
      ownerPhone: '138-0000-0006',
      purchaseDate: '2020-04-08',
      remark: '主板烧毁无维修价值，已作报废待核销处理。',
      attachments: [
        { t: '报废申请.txt', c: '报废申请\n故障：主板烧毁  鉴定：无维修价值  申请人：周导播  待主管签字核销。' }
      ]
    }
  ];

  for (const r of rows) {
    const id = nextId(db, 'gear', 'G');
    const attachments = (r.attachments || []).map((a) =>
      makeAttachment(db, r.code, a.t, a.c, 'text/plain')
    );
    db.equipment.push({
      id,
      ...r,
      attachments,
      createdAt: ts,
      updatedAt: ts
    });
  }

  writeDB(db);
  console.log('种子数据写入完成：');
  console.log(`  用户 ${db.users.length} 个：admin/admin123（管理员）、editor/edit123（器材管理员）、viewer/view123（查看员）`);
  console.log(`  器材 ${db.equipment.length} 条：${CATEGORIES.map((c) => `${c}=${db.equipment.filter((e) => e.category === c).length}`).join(', ')}`);
  console.log(`  数据文件：${DB_FILE}`);
}

seed();
