const Invoice = require('../../models/Invoice');
const utils = require('../../controllers/utils');

exports.getMaxWaybillNo = async (req, res) => {
  try {
    const user = req.user || { no: 0 };
    if (!req.user) {
      console.warn('getMaxWaybillNo: req.user is missing, using default user.no=0');
    }
    const userNo = user.no;
    const uno = utils.leftPad(userNo, 4);
    const date_no = new Date().yyyymmdd() + uno;
    const reg = new RegExp('^01' + date_no + '.*', 'g');
    
    const inv_wnos = await Invoice.find({ waybill_no: { $regex: reg } })
      .select('waybill_no')
      .sort({ waybill_no: 'desc' })
      .limit(1)
      .lean()
      .exec();
    
    let no = utils.leftPad(1, 3);
    if (inv_wnos.length > 0) {
      const lastNoStr = inv_wnos[0].waybill_no.substring(14);
      no = utils.leftPad(parseInt(lastNoStr) + 1, 3);
    }

    const max = '01' + date_no + no;
    res.json({ ok: true, max_no: max });
  } catch (error) {
    console.error('getMaxWaybillNo error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};
