const mongoose = require("mongoose");
const Vehicle = require("../../models/Vehicle");
const Bill = require("../../models/Bill");
const Invoice = require("../../models/Invoice");
const VesselCost = require("../../models/VesselCost");
const DrayageForklift = require("../../models/DrayageForklift");
const utils = require("../utils");
const { buildTenantQuery, isPlatformUser } = require("../../utils/tenant");

function getBillRecordWeight(bill, invRecord) {
  return bill.block_num > 0
    ? (invRecord.num || 0) * (bill.weight || 0)
    : invRecord.weight || 0;
}

function getInnerVehicleWeight(bill, vehicle) {
  if ((vehicle.send_weight || 0) > 0) return vehicle.send_weight;
  return bill.block_num > 0 ? (vehicle.send_num || 0) * (bill.weight || 0) : 0;
}

function buildCustomerNameExpr() {
  return {
    $cond: [
      {
        $and: [
          { $ne: ["$ship_customer", null] },
          { $ne: ["$ship_customer", ""] },
        ],
      },
      { $concat: ["$ship_name", "/", "$ship_customer"] },
      "$ship_name",
    ],
  };
}

function buildMainDetailPipeline(invMatch, vehNames) {
  const sendWeightExpr = {
    $cond: [
      { $gt: [{ $ifNull: ["$billDoc.block_num", 0] }, 0] },
      {
        $multiply: [
          { $ifNull: ["$billDoc.invoices.num", 0] },
          { $ifNull: ["$billDoc.weight", 0] },
        ],
      },
      { $ifNull: ["$billDoc.invoices.weight", 0] },
    ],
  };

  return [
    { $match: invMatch },
    { $unwind: "$bills" },
    {
      $lookup: {
        from: "bills",
        localField: "bills.bill_id",
        foreignField: "_id",
        as: "billDoc",
      },
    },
    { $unwind: "$billDoc" },
    { $unwind: "$billDoc.invoices" },
    {
      $match: {
        $expr: { $eq: ["$billDoc.invoices.inv_no", "$waybill_no"] },
      },
    },
    {
      $match: {
        "billDoc.invoices.veh_ves_name": { $in: vehNames },
      },
    },
    {
      $project: {
        _id: 0,
        sort_vname: "$billDoc.invoices.veh_ves_name",
        sort_ship_date: "$ship_date",
        sort_waybill: "$waybill_no",
        sort_inner_waybill: "",
        vname: "$billDoc.invoices.veh_ves_name",
        name: buildCustomerNameExpr(),
        ship_from: { $ifNull: ["$ship_from", ""] },
        ship_to: "$ship_to",
        price: {
          $multiply: [
            { $ifNull: ["$billDoc.invoices.veh_ves_price", 0] },
            sendWeightExpr,
          ],
        },
        single_price: { $ifNull: ["$billDoc.invoices.veh_ves_price", 0] },
        send_num: { $ifNull: ["$billDoc.invoices.num", 0] },
        send_weight: sendWeightExpr,
        ship_date: "$ship_date",
        charge_cash: { $ifNull: ["$charge_cash", 0] },
        charge_oil: { $ifNull: ["$charge_oil", 0] },
        delay_day: { $ifNull: ["$delay_day", 0] },
        advance_mode: { $ifNull: ["$advance_charge_mode", "现金"] },
        advance_charge: { $ifNull: ["$advance_charge", 0] },
      },
    },
  ];
}

function buildInnerDetailPipeline(invMatch, vehNames) {
  const innerWeightExpr = {
    $cond: [
      { $gt: [{ $ifNull: ["$billDoc.invoices.vehicles.send_weight", 0] }, 0] },
      { $ifNull: ["$billDoc.invoices.vehicles.send_weight", 0] },
      {
        $cond: [
          { $gt: [{ $ifNull: ["$billDoc.block_num", 0] }, 0] },
          {
            $multiply: [
              { $ifNull: ["$billDoc.invoices.vehicles.send_num", 0] },
              { $ifNull: ["$billDoc.weight", 0] },
            ],
          },
          0,
        ],
      },
    ],
  };

  return [
    { $match: invMatch },
    { $unwind: "$bills" },
    {
      $lookup: {
        from: "bills",
        localField: "bills.bill_id",
        foreignField: "_id",
        as: "billDoc",
      },
    },
    { $unwind: "$billDoc" },
    { $unwind: "$billDoc.invoices" },
    {
      $match: {
        $expr: { $eq: ["$billDoc.invoices.inv_no", "$waybill_no"] },
      },
    },
    { $unwind: "$billDoc.invoices.vehicles" },
    {
      $match: {
        "billDoc.invoices.vehicles.veh_name": { $in: vehNames },
      },
    },
    {
      $addFields: {
        matchedInnerSettle: {
          $first: {
            $filter: {
              input: { $ifNull: ["$inner_settle", []] },
              as: "innerSettle",
              cond: {
                $eq: [
                  "$$innerSettle.inner_waybill_no",
                  "$billDoc.invoices.vehicles.inner_waybill_no",
                ],
              },
            },
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        sort_vname: "$billDoc.invoices.vehicles.veh_name",
        sort_ship_date: "$ship_date",
        sort_waybill: "$waybill_no",
        sort_inner_waybill: {
          $ifNull: ["$billDoc.invoices.vehicles.inner_waybill_no", ""],
        },
        vname: "$billDoc.invoices.vehicles.veh_name",
        name: buildCustomerNameExpr(),
        ship_from: {
          $ifNull: ["$billDoc.invoices.vehicles.veh_ship_from", ""],
        },
        ship_to: "$vehicle_vessel_name",
        price: {
          $multiply: [
            { $ifNull: ["$billDoc.invoices.vehicles.veh_price", 0] },
            innerWeightExpr,
          ],
        },
        single_price: { $ifNull: ["$billDoc.invoices.vehicles.veh_price", 0] },
        send_num: { $ifNull: ["$billDoc.invoices.vehicles.send_num", 0] },
        send_weight: innerWeightExpr,
        ship_date: "$ship_date",
        charge_cash: { $ifNull: ["$matchedInnerSettle.charge_cash", 0] },
        charge_oil: { $ifNull: ["$matchedInnerSettle.charge_oil", 0] },
        delay_day: { $ifNull: ["$matchedInnerSettle.delay_day", 0] },
        advance_mode: {
          $ifNull: ["$matchedInnerSettle.advance_charge_mode", "现金"],
        },
        advance_charge: { $ifNull: ["$matchedInnerSettle.advance_charge", 0] },
      },
    },
  ];
}

function buildDetailUnionPipeline(invMatch, vehNames) {
  return [
    ...buildMainDetailPipeline(invMatch, vehNames),
    {
      $unionWith: {
        coll: "invoices",
        pipeline: buildInnerDetailPipeline(invMatch, vehNames),
      },
    },
  ];
}

/**
 * Get Vessel Revenue Statistics Data
 */
exports.getVesselRevenueData = async (req, res) => {
  try {
    const { fDate1, fDate2, fMonths } = req.query;
    if (!fMonths || !Array.isArray(fMonths)) {
      return res.json({ ok: false, message: "缺少月份列表" });
    }

    const months = fMonths;
    const resultData = months.map((m) => ({
      month: m,
      vhTotal: 0,
      vhRevenue: 0,
      vhOwnWeight: 0,
      vhOwnIncome: 0,
      vhOwnDeposit: 0,
      vhOwnProfit: 0,
      vhNonOwnWeight: 0,
      vhNonOwnIncome: 0,
      vhNonOwnDeposit: 0,
      vhProfit: 0,
      vhFixedCost: 0,
      vsTotal: 0,
      vsRevenue: 0,
      vsOwnWeight: 0,
      vsOwnIncome: 0,
      vsOwnDeposit: 0,
      vsOwnProfit: 0,
      vsNonOwnWeight: 0,
      vsNonOwnIncome: 0,
      vsNonOwnDeposit: 0,
      vsProfit: 0,
      vsFixedCost: 0,
      drayage: 0,
      forklift: 0,
    }));

    // 1. Get Vehicle Categories
    const vehList = await Vehicle.find(buildTenantQuery(req, {}))
      .select("name veh_category veh_type")
      .lean()
      .exec();
    const vehObject = {};
    vehList.forEach((v) => {
      vehObject[v.name] = {
        category: v.veh_category,
        type: v.veh_type,
      };
    });

    // 2. Get Fixed Costs
    const vvcList = await VesselCost.find(
      buildTenantQuery(req, {
        month: { $in: months },
      }),
    )
      .select("name total month")
      .lean()
      .exec();

    const costMap = {};
    vvcList.forEach((item) => {
      if (!costMap[item.month]) costMap[item.month] = [];
      costMap[item.month].push({
        name: item.name,
        total: item.total,
        used: false,
      });
    });

    // 3. Get Drayage/Forklift Receivables
    const dfList = await DrayageForklift.find(
      buildTenantQuery(req, {
        month: { $in: months },
      }),
    )
      .lean()
      .exec();

    dfList.forEach((df) => {
      const idx = months.indexOf(df.month);
      if (idx >= 0) {
        resultData[idx].drayage = df.drayage || 0;
        resultData[idx].forklift = df.forklift || 0;
      }
    });

    // 4. Get Invoices within Date Range
    const invQuery = buildTenantQuery(req, {
      // state: { $ne: "新建" },
      ship_date: {
        $gte: utils.parseLocalDate(fDate1),
        $lte: utils.parseLocalDateEnd(fDate2),
      },
    });

    const db_invs = await Invoice.find(invQuery)
      .select("waybill_no vehicle_vessel_name ship_date bills total_weight")
      .lean()
      .exec();

    // 5. Build invoice lookup and fetch all related bills once
    const invoiceMap = {};
    const billIdSet = new Set();
    db_invs.forEach((inv) => {
      invoiceMap[inv.waybill_no] = inv;
      (inv.bills || []).forEach((b) => {
        if (b.bill_id) billIdSet.add(String(b.bill_id));
      });
    });

    const billDocs = await Bill.find(
      buildTenantQuery(req, {
        _id: {
          $in: Array.from(billIdSet).map(
            (id) => new mongoose.Types.ObjectId(id),
          ),
        },
      }),
    )
      .select("block_num weight collection_price invoices")
      .lean()
      .exec();

    const monthMeta = {};
    months.forEach((month) => {
      monthMeta[month] = {
        hasShip: false,
        selfTruckNames: new Set(),
      };
    });

    // 6. Traverse bill invoice records directly.
    // This keeps the statistics path aligned with the detail-list path.
    for (const bill of billDocs) {
      for (const invInBill of bill.invoices || []) {
        const inv = invoiceMap[invInBill.inv_no];
        if (!inv) continue;

        const monthStr = utils.toFinancialMonth(inv.ship_date);
        const mIdx = months.indexOf(monthStr);
        if (mIdx < 0) continue;

        const data = resultData[mIdx];
        const meta = monthMeta[monthStr];
        const vehInfo = vehObject[invInBill.veh_ves_name] || {};
        const vehCategory = vehInfo.category;
        const isShip =
          vehInfo.type === "船" ||
          (vehInfo.type !== "车" &&
            invInBill.vehicles &&
            invInBill.vehicles.length > 0);
        const weight = getBillRecordWeight(bill, invInBill);

        let revenue =
          bill.collection_price > 0 ? bill.collection_price * weight : 0;
        if (invInBill.price > 0) revenue += invInBill.price * weight;

        const vehPayable =
          invInBill.veh_ves_price > 0 ? invInBill.veh_ves_price * weight : 0;

        if (isShip) {
          meta.hasShip = true;
          data.vsTotal += weight;
          data.vsRevenue += revenue;

          if (vehCategory === "自有") {
            data.vsOwnWeight += weight;
            data.vsOwnIncome += revenue;
          } else if (vehCategory === "外挂") {
            data.vsNonOwnWeight += weight;
            data.vsNonOwnIncome += revenue;
            data.vsNonOwnDeposit += vehPayable;
          }

          (invInBill.vehicles || []).forEach((veh) => {
            const innerWeight = getInnerVehicleWeight(bill, veh);
            data.vhTotal += innerWeight;

            const subVehCategory = vehObject[veh.veh_name]?.category;
            if (subVehCategory === "自有") {
              data.vhOwnWeight += innerWeight;
              if (veh.veh_name) meta.selfTruckNames.add(veh.veh_name);
            } else if (subVehCategory === "外挂") {
              data.vhNonOwnWeight += innerWeight;
            }
          });
        } else {
          data.vhTotal += weight;
          data.vhRevenue += revenue;

          if (vehCategory === "自有") {
            data.vhOwnWeight += weight;
            data.vhOwnIncome += revenue;
            if (invInBill.veh_ves_name)
              meta.selfTruckNames.add(invInBill.veh_ves_name);
          } else if (vehCategory === "外挂") {
            data.vhNonOwnWeight += weight;
            data.vhNonOwnIncome += revenue;
            data.vhNonOwnDeposit += vehPayable;
          }
        }
      }
    }

    // 7. Apply fixed costs once per month / vehicle
    months.forEach((month, idx) => {
      const costs = costMap[month] || [];
      const meta = monthMeta[month];
      const data = resultData[idx];

      if (meta?.hasShip) {
        const shipCost = costs.find((c) => c.name === "chuan");
        if (shipCost) {
          data.vsFixedCost += shipCost.total;
        }
      }

      meta?.selfTruckNames?.forEach((vname) => {
        const truckCost = costs.find((c) => c.name === vname);
        if (truckCost) {
          data.vhFixedCost += truckCost.total;
        }
      });
    });

    // Final Calculation for Profits
    resultData.forEach((d) => {
      d.vhOwnProfit = utils.toFixedNumber(d.vhOwnIncome - d.vhOwnDeposit, 3);
      d.vhProfit = utils.toFixedNumber(d.vhNonOwnIncome - d.vhNonOwnDeposit, 3);
      d.vsOwnProfit = utils.toFixedNumber(d.vsOwnIncome - d.vsOwnDeposit, 3);
      d.vsProfit = utils.toFixedNumber(d.vsNonOwnIncome - d.vsNonOwnDeposit, 3);

      // Round everything
      Object.keys(d).forEach((k) => {
        if (typeof d[k] === "number" && k !== "month")
          d[k] = utils.toFixedNumber(d[k], 3);
      });
    });

    res.json({ ok: true, stat_data: resultData });
  } catch (error) {
    console.error("getVesselRevenueData error:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
};

/**
 * Get Detail Data for Vessel Allocation
 */
exports.getVesselAllocationDetail = async (req, res) => {
  try {
    const { fDate1, fDate2, fVehType, fSummary, fVehMode } = req.query;
    const isSummary = fSummary === "YES";
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 50, 1),
      500,
    );

    const vehQuery = { veh_category: fVehType };
    if (fVehMode === "车" || fVehMode === "船") {
      vehQuery.veh_type = fVehMode;
    }

    const vehList = await Vehicle.find(buildTenantQuery(req, vehQuery))
      .select("name contact_name")
      .lean()
      .exec();
    const vehNames = vehList.map((v) => v.name);

    const invQuery = buildTenantQuery(req, {
      state: { $ne: "新建" },
      ship_date: {
        $gte: utils.parseLocalDate(fDate1),
        $lte: utils.parseLocalDateEnd(fDate2),
      },
    });
    if (vehNames.length === 0) {
      return isSummary
        ? res.json({ ok: true, summary_data: {} })
        : res.json({ ok: true, rows: [], total: 0, page, limit });
    }

    if (isSummary) {
      const allRows = await Invoice.aggregate(
        buildDetailUnionPipeline(invQuery, vehNames),
      )
        .allowDiskUse(true)
        .exec();

      const summaryData = {};
      allRows.forEach((item) => {
        const vname = item.vname;
        const vehInfo = vehList.find((v) => v.name === vname);
        if (!summaryData[vname]) {
          summaryData[vname] = {
            weight: 0,
            amount: 0,
            contact: vehInfo ? vehInfo.contact_name : "",
          };
        }
        summaryData[vname].weight += item.send_weight || 0;
        summaryData[vname].amount += item.price || 0;
      });
      Object.keys(summaryData).forEach((vname) => {
        summaryData[vname].weight = utils.toFixedNumber(
          summaryData[vname].weight,
          3,
        );
        summaryData[vname].amount = utils.toFixedNumber(
          summaryData[vname].amount,
          3,
        );
      });
      res.json({ ok: true, summary_data: summaryData });
    } else {
      const unionPipeline = buildDetailUnionPipeline(invQuery, vehNames);
      const countResult = await Invoice.aggregate([
        ...unionPipeline,
        { $count: "total" },
      ])
        .allowDiskUse(true)
        .exec();

      const total = countResult[0]?.total || 0;
      const rows = await Invoice.aggregate([
        ...unionPipeline,
        {
          $sort: {
            sort_vname: 1,
            sort_ship_date: 1,
            sort_waybill: 1,
            sort_inner_waybill: 1,
          },
        },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          $project: {
            sort_vname: 0,
            sort_ship_date: 0,
            sort_waybill: 0,
            sort_inner_waybill: 0,
          },
        },
      ])
        .allowDiskUse(true)
        .exec();

      res.json({
        ok: true,
        rows,
        total,
        page,
        limit,
      });
    }
  } catch (error) {
    console.error("getVesselAllocationDetail error:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
};
