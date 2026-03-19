const mongoose = require('mongoose');
const Vehicle = require('../../models/Vehicle');
const Bill = require('../../models/Bill');
const Invoice = require('../../models/Invoice');
const VesselCost = require('../../models/VesselCost');
const DrayageForklift = require('../../models/DrayageForklift');
const utils = require('../utils');
const { buildTenantQuery, isPlatformUser } = require('../../utils/tenant');

/**
 * Get Vessel Revenue Statistics Data
 */
exports.getVesselRevenueData = async (req, res) => {
  try {
    const { fDate1, fDate2, fMonths } = req.query;
    if (!fMonths || !Array.isArray(fMonths)) {
      return res.json({ ok: false, message: '缺少月份列表' });
    }

    const months = fMonths;
    const resultData = months.map(m => ({
      month: m,
      vhTotal: 0, vhRevenue: 0, vhOwnWeight: 0, vhOwnIncome: 0, vhOwnDeposit: 0, vhOwnProfit: 0, 
      vhNonOwnWeight: 0, vhNonOwnIncome: 0, vhNonOwnDeposit: 0, vhProfit: 0, vhFixedCost: 0,
      vsTotal: 0, vsRevenue: 0, vsOwnWeight: 0, vsOwnIncome: 0, vsOwnDeposit: 0, vsOwnProfit: 0, 
      vsNonOwnWeight: 0, vsNonOwnIncome: 0, vsNonOwnDeposit: 0, vsProfit: 0, vsFixedCost: 0,
      drayage: 0, forklift: 0
    }));

    // 1. Get Vehicle Categories
    const vehList = await Vehicle.find(buildTenantQuery(req, {})).select('name veh_category').lean().exec();
    const vehObject = {};
    vehList.forEach(v => { vehObject[v.name] = v.veh_category; });

    // 2. Get Fixed Costs
    const vvcList = await VesselCost.find(buildTenantQuery(req, {
      month: { $in: months }
    })).select('name total month').lean().exec();
    
    const costMap = {};
    vvcList.forEach(item => {
      if (!costMap[item.month]) costMap[item.month] = [];
      costMap[item.month].push({ name: item.name, total: item.total, used: false });
    });

    // 3. Get Drayage/Forklift Receivables
    const dfList = await DrayageForklift.find(buildTenantQuery(req, {
      month: { $in: months }
    })).lean().exec();
    
    dfList.forEach(df => {
      const idx = months.indexOf(df.month);
      if (idx >= 0) {
        resultData[idx].drayage = df.drayage || 0;
        resultData[idx].forklift = df.forklift || 0;
      }
    });

    // 4. Get Invoices within Date Range
    const invQuery = buildTenantQuery(req, {
      state: { $ne: '新建' },
      ship_date: { $gte: utils.parseLocalDate(fDate1), $lte: utils.parseLocalDateEnd(fDate2) }
    });

    const db_invs = await Invoice.find(invQuery)
      .select('waybill_no vehicle_vessel_name ship_date bills total_weight')
      .lean()
      .exec();

    // 5. Process Each Invoice
    for (const inv of db_invs) {
      const monthStr = utils.toFinancialMonth(inv.ship_date);
      const mIdx = months.indexOf(monthStr);
      if (mIdx < 0) continue;

      const data = resultData[mIdx];
      const monthCosts = costMap[monthStr] || [];

      // Fetch related bills
      const billIds = inv.bills.map(b => b.bill_id);
      const bills = await Bill.find(buildTenantQuery(req, { _id: { $in: billIds } }))
        .select('block_num weight collection_price invoices')
        .lean()
        .exec();

      for (const bill of bills) {
        // Find the specific invoice record within the bill
        const invInBill = bill.invoices.find(ib => ib.inv_no === inv.waybill_no);
        if (!invInBill) continue;

        const vehType = vehObject[invInBill.veh_ves_name];
        const weight = (bill.block_num > 0) ? invInBill.num * bill.weight : invInBill.weight;
        let revenue = (bill.collection_price > 0) ? bill.collection_price * weight : 0;
        if (invInBill.price > 0) revenue += invInBill.price * weight;

        const vehPayable = (invInBill.veh_ves_price > 0) ? invInBill.veh_ves_price * weight : 0;

        if (invInBill.vehicles && invInBill.vehicles.length > 0) {
          // Vessel (Ship)
          data.vsTotal += weight;
          data.vsRevenue += revenue;

          if (vehType === '自有') {
            data.vsOwnWeight += weight;
            data.vsOwnIncome += revenue;
          } else if (vehType === '外挂') {
            data.vsNonOwnWeight += weight;
            data.vsNonOwnIncome += revenue;
            data.vsNonOwnDeposit += vehPayable;
          }

          // Handle sub-vehicles for the ship
          const vnameList = [];
          invInBill.vehicles.forEach(veh => {
            data.vhTotal += veh.send_weight;
            const subVehType = vehObject[veh.veh_name];
            if (subVehType === '自有') {
              data.vhOwnWeight += veh.send_weight;
              if (veh.veh_name && !vnameList.includes(veh.veh_name)) vnameList.push(veh.veh_name);
            } else if (subVehType === '外挂') {
              data.vhNonOwnWeight += veh.send_weight;
            }
          });

          // Fixed Costs for Ship
          const shipCost = monthCosts.find(c => !c.used && c.name === 'chuan');
          if (shipCost) {
            data.vsFixedCost += shipCost.total;
            shipCost.used = true;
          }
          
          // Fixed Costs for internal trucks
          vnameList.forEach(vname => {
            const truckCost = monthCosts.find(c => !c.used && c.name === vname);
            if (truckCost) {
              data.vhFixedCost += truckCost.total;
              truckCost.used = true;
            }
          });

        } else {
          // Truck only
          data.vhTotal += weight;
          data.vhRevenue += revenue;

          if (vehType === '自有') {
            data.vhOwnWeight += weight;
            data.vhOwnIncome += revenue;
            
            // Check for fixed cost of this specific truck
            const truckCost = monthCosts.find(c => !c.used && c.name === invInBill.veh_ves_name);
            if (truckCost) {
              data.vhFixedCost += truckCost.total;
              truckCost.used = true;
            }
          } else if (vehType === '外挂') {
            data.vhNonOwnWeight += weight;
            data.vhNonOwnIncome += revenue;
            data.vhNonOwnDeposit += vehPayable;
          }
        }
      }
    }

    // Final Calculation for Profits
    resultData.forEach(d => {
      d.vhOwnProfit = utils.toFixedNumber(d.vhOwnIncome - d.vhOwnDeposit, 3);
      d.vhProfit = utils.toFixedNumber(d.vhNonOwnIncome - d.vhNonOwnDeposit, 3);
      d.vsOwnProfit = utils.toFixedNumber(d.vsOwnIncome - d.vsOwnDeposit, 3);
      d.vsProfit = utils.toFixedNumber(d.vsNonOwnIncome - d.vsNonOwnDeposit, 3);
      
      // Round everything
      Object.keys(d).forEach(k => {
        if (typeof d[k] === 'number' && k !== 'month') d[k] = utils.toFixedNumber(d[k], 3);
      });
    });

    res.json({ ok: true, stat_data: resultData });
  } catch (error) {
    console.error('getVesselRevenueData error:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
};

/**
 * Get Detail Data for Vessel Allocation
 */
exports.getVesselAllocationDetail = async (req, res) => {
  try {
    const { fDate1, fDate2, fVehType, fSummary } = req.query;
    const isSummary = fSummary === 'YES';

    const vehList = await Vehicle.find(buildTenantQuery(req, { veh_category: fVehType }))
      .select('name contact_name')
      .lean()
      .exec();
    const vehNames = vehList.map(v => v.name);

    const invQuery = buildTenantQuery(req, {
      state: { $ne: '新建' },
      ship_date: { $gte: utils.parseLocalDate(fDate1), $lte: utils.parseLocalDateEnd(fDate2) }
    });

    const db_invs = await Invoice.find(invQuery).lean().exec();
    if (!db_invs || db_invs.length === 0) return res.json({ ok: true, vessel_detail: {}, summary_data: {} });

    const billIds = [];
    db_invs.forEach(inv => inv.bills.forEach(b => billIds.push(b.bill_id)));
    
    const bills = await Bill.find(buildTenantQuery(req, { _id: { $in: billIds } }))
      .select('bill_no order_no order_item_no block_num weight invoices')
      .lean()
      .exec();

    const detailObj = {};
    const invMap = {};
    db_invs.forEach(inv => { invMap[inv.waybill_no] = inv; });

    for (const bill of bills) {
      for (const invRecord of bill.invoices) {
        const inv = invMap[invRecord.inv_no];
        if (!inv) continue;

        const weight = (bill.block_num > 0) ? invRecord.num * bill.weight : invRecord.weight;
        const customerName = inv.ship_customer ? `${inv.ship_name}/${inv.ship_customer}` : inv.ship_name;

        // Main Vehicle/Vessel check
        if (invRecord.veh_ves_name && vehNames.includes(invRecord.veh_ves_name)) {
          const vname = invRecord.veh_ves_name;
          if (!detailObj[vname]) detailObj[vname] = [];
          
          detailObj[vname].push({
            name: customerName,
            ship_from: inv.ship_from || '',
            ship_to: inv.ship_to,
            price: utils.toFixedNumber(invRecord.veh_ves_price * weight, 3),
            single_price: invRecord.veh_ves_price,
            send_num: invRecord.num,
            send_weight: weight,
            ship_date: inv.ship_date,
            charge_cash: inv.charge_cash || 0,
            charge_oil: inv.charge_oil || 0,
            delay_day: inv.delay_day || 0,
            advance_mode: inv.advance_charge_mode || '现金',
            advance_charge: inv.advance_charge || 0
          });
        }

        // Internal sub-vehicles (if it's a ship)
        if (invRecord.vehicles && invRecord.vehicles.length > 0) {
          invRecord.vehicles.forEach(subVeh => {
            if (vehNames.includes(subVeh.veh_name)) {
              const vname = subVeh.veh_name;
              if (!detailObj[vname]) detailObj[vname] = [];

              // Find inner settle data for this sub-vehicle
              const innerSettle = (inv.inner_settle || []).find(is => is.inner_waybill_no === subVeh.inner_waybill_no) || {};

              detailObj[vname].push({
                name: customerName,
                ship_from: subVeh.veh_ship_from || '',
                ship_to: inv.vehicle_vessel_name, // Destination is the ship
                price: utils.toFixedNumber(subVeh.veh_price * subVeh.send_weight, 3),
                single_price: subVeh.veh_price,
                send_num: subVeh.send_num,
                send_weight: subVeh.send_weight,
                ship_date: inv.ship_date,
                charge_cash: innerSettle.charge_cash || 0,
                charge_oil: innerSettle.charge_oil || 0,
                delay_day: innerSettle.delay_day || 0,
                advance_mode: innerSettle.advance_charge_mode || '现金',
                advance_charge: innerSettle.advance_charge || 0
              });
            }
          });
        }
      }
    }

    if (isSummary) {
      const summaryData = {};
      Object.keys(detailObj).forEach(vname => {
        const vehInfo = vehList.find(v => v.name === vname);
        summaryData[vname] = { 
          weight: 0, 
          amount: 0, 
          contact: vehInfo ? vehInfo.contact_name : '' 
        };
        detailObj[vname].forEach(item => {
          summaryData[vname].weight += item.send_weight;
          summaryData[vname].amount += item.price;
        });
        summaryData[vname].weight = utils.toFixedNumber(summaryData[vname].weight, 3);
        summaryData[vname].amount = utils.toFixedNumber(summaryData[vname].amount, 3);
      });
      res.json({ ok: true, summary_data: summaryData });
    } else {
      res.json({ 
        ok: true, 
        vessel_detail: detailObj, 
        vehNameList: Object.keys(detailObj).sort((a, b) => a.localeCompare(b))
      });
    }
  } catch (error) {
    console.error('getVesselAllocationDetail error:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
};
