const Tenant = require('../models/Tenant');
const SealRequest = require('../models/SealRequest');
const SealUsageLog = require('../models/SealUsageLog');
const Notice = require('../models/Notice');
const User = require('../models/User');
const { isStandalone } = require('../utils/deploy-mode');
const secrets = require('../config/secrets');

/**
 * 执行一次全量租户逾期扫描与分级催办
 */
async function runSealOverdueCheck() {
  try {
    let tenants = [];
    if (isStandalone()) {
      const enabled = secrets.enableSeal === true || process.env.ENABLE_SEAL === 'true';
      if (enabled) {
        tenants = await Tenant.find({}).select('_id settings').lean();
      }
    } else {
      tenants = await Tenant.find({ 'settings.sealEnabled': true }).select('_id settings').lean();
    }

    if (!tenants || tenants.length === 0) return;

    const now = new Date();

    for (const tenant of tenants) {
      const tenantId = tenant._id;
      const settings = tenant.settings || {};
      const remindMinutes = Number(settings.sealOverdueRemindMinutes) || 120;
      const escalateMinutes = Number(settings.sealOverdueEscalateMinutes) || 1440;

      // 1. 将所有已到期且仍为 checked_out 的单据更新为 overdue
      const overdueCandidates = await SealRequest.find({
        tenantId,
        status: 'checked_out',
        expectedReturnAt: { $lt: now }
      });

      for (const req of overdueCandidates) {
        req.status = 'overdue';
        req.updatedAt = new Date();
        await req.save();

        for (const st of req.sealTypes) {
          await SealUsageLog.create({
            tenantId,
            sealType: st,
            requestId: req._id,
            action: 'overdue',
            operatorName: '系统',
            note: `超过预计归还时间 ${new Date(req.expectedReturnAt).toLocaleTimeString('zh-CN')}，自动标记逾期`
          }).catch(() => {});
        }
      }

      // 2. 扫描所有处于 overdue 状态的申请进行分级催办
      const activeOverdues = await SealRequest.find({
        tenantId,
        status: 'overdue'
      });

      for (const req of activeOverdues) {
        const overdueMinutes = Math.floor((now.getTime() - new Date(req.expectedReturnAt).getTime()) / 60000);
        const reminders = req.reminders || [];

        // 级别 1：刚逾期通知借用人和专职保管员
        if (!reminders.includes('borrower')) {
          const updated = await SealRequest.findOneAndUpdate(
            { _id: req._id, reminders: { $ne: 'borrower' } },
            { $push: { reminders: 'borrower' } },
            { new: true }
          );

          if (updated) {
            // 给借用人催还
            await Notice.create({
              tenantId,
              userId: req.applicantId,
              kind: 'seal_overdue',
              title: '用章已逾期催还通知',
              body: `你的用章单 No.${req.serialNo}（${req.documentName}）已超过预计归还时间，请尽快前往保管员处归还印章。`,
              link: `/seal/requests?id=${req._id}`
            }).catch(() => {});

            // 给专职保管员提醒（支持多人）
            const rawCustodians = settings.sealCustodianIds?.length ? settings.sealCustodianIds : (settings.sealCustodianId ? [settings.sealCustodianId] : []);
            for (const cId of rawCustodians) {
              await Notice.create({
                tenantId,
                userId: cId,
                kind: 'seal_overdue',
                title: '印章在借逾期提醒',
                body: `员工 ${req.applicant?.name} 的用章单 No.${req.serialNo} 已超过预计归还时间未归还。`,
                link: '/seal/workbench'
              }).catch(() => {});
            }

            for (const st of req.sealTypes) {
              await SealUsageLog.create({
                tenantId,
                sealType: st,
                requestId: req._id,
                action: 'remind',
                operatorName: '系统',
                note: '自动触发逾期催还通知（借用人与保管员）'
              }).catch(() => {});
            }
          }
        }

        // 级别 2：逾期超过 sealOverdueRemindMinutes 通知直属主管
        if (overdueMinutes >= remindMinutes && !reminders.includes('manager')) {
          const borrowerUser = await User.findById(req.applicantId).select('managerId').lean();
          if (borrowerUser && borrowerUser.managerId) {
            const updated = await SealRequest.findOneAndUpdate(
              { _id: req._id, reminders: { $ne: 'manager' } },
              { $push: { reminders: 'manager' } },
              { new: true }
            );

            if (updated) {
              await Notice.create({
                tenantId,
                userId: borrowerUser.managerId,
                kind: 'seal_overdue',
                title: '下属用章严重逾期提醒',
                body: `你部门员工 ${req.applicant?.name} 的用章单 No.${req.serialNo} 逾期已超过 ${remindMinutes} 分钟未归还，请协助督促归还。`,
                link: `/seal/requests?id=${req._id}`
              }).catch(() => {});

              for (const st of req.sealTypes) {
                await SealUsageLog.create({
                  tenantId,
                  sealType: st,
                  requestId: req._id,
                  action: 'remind',
                  operatorName: '系统',
                  note: `逾期超 ${remindMinutes} 分钟，已通知直属主管`
                }).catch(() => {});
              }
            }
          }
        }

        // 级别 3：逾期超过 sealOverdueEscalateMinutes 升级通知总经理
        if (overdueMinutes >= escalateMinutes && !reminders.includes('gm')) {
          const gm = await User.findOne({
            tenantId,
            status: { $ne: 'disabled' },
            attendanceRoles: 'general_manager'
          }).select('_id').lean();

          const gmId = gm?._id || (await User.findOne({ tenantId, role: 'owner' }).select('_id').lean())?._id;

          if (gmId) {
            const updated = await SealRequest.findOneAndUpdate(
              { _id: req._id, reminders: { $ne: 'gm' } },
              { $push: { reminders: 'gm' } },
              { new: true }
            );

            if (updated) {
              await Notice.create({
                tenantId,
                userId: gmId,
                kind: 'seal_overdue_escalate',
                title: '用章严重逾期升级预警',
                body: `员工 ${req.applicant?.name} 的用章单 No.${req.serialNo} 逾期已达 ${Math.round(overdueMinutes / 60)} 小时未归还，系统已升级预警。`,
                link: `/seal/requests?id=${req._id}`
              }).catch(() => {});

              for (const st of req.sealTypes) {
                await SealUsageLog.create({
                  tenantId,
                  sealType: st,
                  requestId: req._id,
                  action: 'remind',
                  operatorName: '系统',
                  note: `逾期超 ${escalateMinutes} 分钟，已升级通知总经理`
                }).catch(() => {});
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('runSealOverdueCheck error:', error);
  }
}

let schedulerTimer = null;

function startSealScheduler(intervalMs = 300000) {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(runSealOverdueCheck, intervalMs);
}

function stopSealScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

module.exports = {
  runSealOverdueCheck,
  startSealScheduler,
  stopSealScheduler
};
