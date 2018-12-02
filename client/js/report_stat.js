/**
 * Created by ezefjia on 7/8/2014.
 */

$(function () {
  var titleEN2CN = {
    "settledWDS": "结算吨数(代收)", "notSettledWDS": "未结算吨数(代收)", "notNeedWDS": "不需结算吨数(代收)",
    "settledWZT": "结算吨数(自提)", "notSettledWZT": "未结算吨数(自提)", "notNeedWZT": "不需结算吨数(自提)",
    "totalWeight": "总吨数", "totalPrice": "总金额"
  };

  var tableBody    = $('#table-tbody');
  var startDateGrp = $('#start-date-grp');
  var endDateGrp   = $('#end-date-grp');
  var yearGrp      = $('#year-grp');
  var monthGrp     = $('#month-grp');
  var dbData = [];
  var chartData = [];
  var chart;
  var startDate, endDate;
  var allNames = [];
  var btnOk = $('#stat-btn-ok');
  var ckShowDiagram = $('#show-statistics-report');
  var action = local_action;
  var ldata;
  var chartWeight = true;

  var detailTBody = $('#detail-tbody');

  if (action === "CUSTOMER") {
    var billNameFilter = new FilterElementD($('#bill-name'), sort_pinyin(local_data), false, true, null);
    ldata = null;
  } else {
    ldata = {};
    local_data.forEach(function(ld) {
      ldata[ld.month] = {drayage: ld.drayage, forklift: ld.forklift}
    });
  }

  ckShowDiagram.iCheck('uncheck');
  initial();

  function dateChanged(e) {
    var me = $(e.target);
    var id = me.attr('id');
    if (id === "month-grp") {
      startDate = e.date.startOf('month');
      endDate = moment(startDate).add(1, 'months');
      setHtmlElementDisabled(btnOk, false);
    }
    else if (id === "start-date-grp") {
      endDateGrp.data("DateTimePicker").setMinDate(e.date);
      startDate = e.date.startOf('month');
      if (startDate && endDate && startDate.isBefore(endDate)) {
        setHtmlElementDisabled(btnOk, false);
      }
    }
    else if (id === "end-date-grp") {
      startDateGrp.data("DateTimePicker").setMaxDate(e.date);
      endDate = e.date.startOf('month').add(1, 'months');
      if (startDate && endDate && startDate.isBefore(endDate)) {
        setHtmlElementDisabled(btnOk, false);
      }
    }
    else {
      startDate = e.date.startOf('year');
      endDate = moment(startDate).add(1, 'years');
      setHtmlElementDisabled(btnOk, false);
    }
  }

  function getMonthList() {
    var numOfMonth = endDate.diff(startDate, 'months');
    var monthList = [];
    var date = moment(startDate);
    for (var i = 0; i < numOfMonth; ++i) {
      monthList.push(date.format('YYYY-MM'));
      date.add(1, 'months');
    }

    return monthList;
  }

  function generateCustomerData() {
    var obj = { fName: billNameFilter.selected, fDate1: startDate.toISOString(), fDate2: endDate.toISOString(), fMonths: getMonthList() };
    $.get('/get_statistics_data', obj, function (data) {
      var result = jQuery.parseJSON(data);

      dbData    = [];
      allNames  = [];
      if (result.ok) {
        dbData = result.stat_data;
        allNames = result.names;
        showCustomerData(false);
      }

      ckShowDiagram.iCheck('uncheck');
      nlApp.hidePleaseWait();
    });
  }

  function generateVesselData() {
    var obj = { fDate1: startDate.toISOString(), fDate2: endDate.toISOString(), fMonths: getMonthList() }; // , fVehicles: vehicles };
    $.get('/get_vessel_revenue_data', obj, function (data) {
      dbData = [];
      var result = jQuery.parseJSON(data);
      if (result.ok) {
        dbData = result.stat_data;
      }

      tableBody.empty();
      var s1 = '<tr><td rowspan="2" style="text-align:center;vertical-align:middle">{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td><td>{11}</td><td>{12}</td><td>{13}</td><td>{14}</td><td style="font-weight:bold;color:{15}">{16}</td></tr>';
      var s2 = '<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td><td>{11}</td><td>{12}</td><td>{13}</td><td style="font-weight:bold;color:{14}">{15}</td></tr>';
      var vh1 = 0, vh2 = 0, vh3 = 0, vh4 = 0, vh5 = 0, vh6 = 0, vh7 = 0, vh8 = 0, vh9 = 0, vh10 = 0, vhc = 0;
      var vs1 = 0, vs2 = 0, vs3 = 0, vs4 = 0, vs5 = 0, vs6 = 0, vs7 = 0, vs8 = 0, vs9 = 0, vs10 = 0, vsc = 0;

      var drayage = 0, forklift = 0;
      
      dbData.forEach(function(vv) {
        vv.vhTotal = toFixedNumber(vv.vhTotal, 3);
        vv.vhRevenue = toFixedNumber(vv.vhRevenue, 3);
        vv.vhOwnWeight = toFixedNumber(vv.vhOwnWeight, 3);
        vv.vhOwnIncome = toFixedNumber(vv.vhOwnIncome, 3);
        vv.vhOwnDeposit = toFixedNumber(vv.vhOwnDeposit, 3);
        vv.vhOwnProfit = toFixedNumber(vv.vhOwnIncome - vv.vhOwnDeposit, 3);
        vv.vhNonOwnWeight = toFixedNumber(vv.vhNonOwnWeight, 3);
        vv.vhNonOwnIncome = toFixedNumber(vv.vhNonOwnIncome, 3);
        vv.vhNonOwnDeposit = toFixedNumber(vv.vhNonOwnDeposit, 3);
        vv.vhFixedCost = toFixedNumber(vv.vhFixedCost, 3);
        vv.vhProfit = toFixedNumber(vv.vhNonOwnIncome - vv.vhNonOwnDeposit, 3);

        vv.vsTotal = toFixedNumber(vv.vsTotal, 3);
        vv.vsRevenue = toFixedNumber(vv.vsRevenue, 3);
        vv.vsOwnWeight = toFixedNumber(vv.vsOwnWeight, 3);
        vv.vsOwnIncome = toFixedNumber(vv.vsOwnIncome, 3);
        vv.vsOwnDeposit = toFixedNumber(vv.vsOwnDeposit, 3);
        vv.vsOwnProfit = toFixedNumber(vv.vsOwnIncome - vv.vsOwnDeposit, 3);
        vv.vsNonOwnWeight = toFixedNumber(vv.vsNonOwnWeight, 3);
        vv.vsNonOwnIncome = toFixedNumber(vv.vsNonOwnIncome, 3);
        vv.vsNonOwnDeposit = toFixedNumber(vv.vsNonOwnDeposit, 3);
        vv.vsFixedCost = toFixedNumber(vv.vsFixedCost, 3);
        vv.vsProfit = toFixedNumber(vv.vsNonOwnIncome - vv.vsNonOwnDeposit, 3);

        var profit1 = vv.vsOwnProfit + vv.vsProfit - vv.vsFixedCost;
        var profit  = vv.vhOwnProfit + vv.vhProfit - vv.vhFixedCost;
        tableBody.append(s1.format(vv.month, '船运', vv.vsTotal, vv.vsRevenue, vv.vsOwnWeight, vv.vsOwnIncome, vv.vsOwnDeposit, vv.vsOwnProfit,
          vv.vsNonOwnWeight, vv.vsNonOwnIncome, vv.vsNonOwnDeposit, vv.vsProfit, vv.vsFixedCost, 0, 0, (profit1 >= 0 ? 'red': 'green'), getStrValue(profit1)));

        var tmp = ldata[vv.month];
        if (tmp) {
          drayage += tmp.drayage;
          forklift += tmp.forklift;
          tableBody.append(s2.format('车运', vv.vhTotal, vv.vhRevenue, vv.vhOwnWeight, vv.vhOwnIncome, vv.vhOwnDeposit, vv.vhOwnProfit,
            vv.vhNonOwnWeight, vv.vhNonOwnIncome, vv.vhNonOwnDeposit, vv.vhProfit, vv.vhFixedCost, getStrValue(tmp.drayage), getStrValue(tmp.forklift), (profit >= 0 ? 'red': 'green'), getStrValue(profit + tmp.drayage + tmp.forklift)));
        } else {
          tableBody.append(s2.format('车运', vv.vhTotal, vv.vhRevenue, vv.vhOwnWeight, vv.vhOwnIncome, vv.vhOwnDeposit, vv.vhOwnProfit,
            vv.vhNonOwnWeight, vv.vhNonOwnIncome, vv.vhNonOwnDeposit, vv.vhProfit, vv.vhFixedCost, 0, 0, (profit >= 0 ? 'red' : 'green'), getStrValue(profit)));
        }

        vh1 += vv.vhTotal;
        vh2 += vv.vhRevenue;
        vh3 += vv.vhOwnWeight;
        vh4 += vv.vhOwnIncome;
        vh5 += vv.vhOwnDeposit;
        vh6 += vv.vhOwnProfit;
        vh7 += vv.vhNonOwnWeight;
        vh8 += vv.vhNonOwnIncome;
        vh9 += vv.vhNonOwnDeposit;
        vh10 += vv.vhProfit;
        vhc += vv.vhFixedCost;

        vs1 += vv.vsTotal;
        vs2 += vv.vsRevenue;
        vs3 += vv.vsOwnWeight;
        vs4 += vv.vsOwnIncome;
        vs5 += vv.vsOwnDeposit;
        vs6 += vv.vsOwnProfit;
        vs7 += vv.vsNonOwnWeight;
        vs8 += vv.vsNonOwnIncome;
        vs9 += vv.vsNonOwnDeposit;
        vs10 += vv.vsProfit;
        vsc += vv.vsFixedCost;
      });

      if (dbData.length > 1) {
        var t1 = vh6 + vh10 - vhc + drayage + forklift;
        var t2 = vs6 + vs10 - vsc;
        tableBody.append(s1.format("总计", '船运', getStrValue(vs1), getStrValue(vs2), getStrValue(vs3), getStrValue(vs4),
          getStrValue(vs5), getStrValue(vs6), getStrValue(vs7), getStrValue(vs8), getStrValue(vs9), getStrValue(vs10), getStrValue(vsc), 0, 0, (t2 >= 0 ? 'red': 'green'), getStrValue(t2)));
        tableBody.append(s2.format('车运', getStrValue(vh1), getStrValue(vh2), getStrValue(vh3), getStrValue(vh4),
          getStrValue(vh5), getStrValue(vh6), getStrValue(vh7), getStrValue(vh8), getStrValue(vh9), getStrValue(vh10), getStrValue(vhc), getStrValue(drayage), getStrValue(forklift), (t1 >= 0 ? 'red': 'green'), getStrValue(t1)));
      }

      ckShowDiagram.iCheck('uncheck');
      nlApp.hidePleaseWait();
    });
  }

  function showCustomerData(isZeroToSpace) {
    var len = dbData.length;
    if (len > 0) {
      tableBody.empty();
      var s = '<tr><td>{0}</td><td>{1}</td><td style="color:blue">{2}</td><td>{3}</td><td style="color:blue">{4}</td><td>{5}</td><td>{6}</td><td style="color:blue">{7}</td><td>{8}</td><td style="color:blue">{9}</td><td>{10}</td><td>{11}</td><td align="right"><code>{12}</code></td></tr>';
      var wds1 = 0, wds2 = 0, wds3 = 0, wzt1 = 0, wzt2 = 0, wzt3 = 0, total = 0, tprice = 0;
      var pds1 = 0, pds2 = 0, pzt1 = 0, pzt2 = 0;
      var i = 0, item;

      if (isZeroToSpace) {
        for (i = 0; i < len; ++i) {
          item = dbData[i];
          wds1 += item.settledWDS;
          wds2 += item.notSettledWDS;
          pds1 += item.settledPDS;
          pds2 += item.notSettledPDS;
          wds3 += item.notNeedWDS;
          wzt1 += item.settledWZT;
          wzt2 += item.notSettledWZT;
          pzt1 += item.settledPZT;
          pzt2 += item.notSettledPZT;
          wzt3 += item.notNeedWZT;
          total += item.totalWeight;
          tprice += item.totalPrice;

          tableBody.append(s.format(item.name,
            item.settledWDS > 0 ? item.settledWDS : '',
            item.settledPDS > 0 ? item.settledPDS : '',
            item.notSettledWDS > 0 ? item.notSettledWDS : '',
            item.notSettledPDS > 0 ? item.notSettledPDS : '',
            item.notNeedWDS > 0 ? item.notNeedWDS : '',
            item.settledWZT > 0 ? item.settledWZT : '',
            item.settledPZT > 0 ? item.settledPZT : '',
            item.notSettledWZT > 0 ? item.notSettledWZT : '',
            item.notSettledPZT > 0 ? item.notSettledPZT : '',
            item.notNeedWZT > 0 ? item.notNeedWZT : '', item.totalWeight, item.totalPrice));
        }
      } else {
        for (i = 0; i < len; ++i) {
          item = dbData[i];
          wds1 += item.settledWDS;
          wds2 += item.notSettledWDS;
          pds1 += item.settledPDS;
          pds2 += item.notSettledPDS;
          wds3 += item.notNeedWDS;
          wzt1 += item.settledWZT;
          wzt2 += item.notSettledWZT;
          pzt1 += item.settledPZT;
          pzt2 += item.notSettledPZT;
          wzt3 += item.notNeedWZT;
          total += item.totalWeight;
          tprice += item.totalPrice;

          tableBody.append(s.format(item.name,
            item.settledWDS, item.settledPDS, item.notSettledWDS, item.notSettledPDS, item.notNeedWDS,
            item.settledWZT, item.settledPZT, item.notSettledWZT, item.notSettledPZT, item.notNeedWZT, item.totalWeight, item.totalPrice));
        }
      }

      tableBody.append(s.format("总计", getStrValue(wds1), getStrValue(pds1), getStrValue(wds2), getStrValue(pds2), getStrValue(wds3),
        getStrValue(wzt1), getStrValue(pzt1), getStrValue(wzt2), getStrValue(pzt2), getStrValue(wzt3), getStrValue(total), getStrValue(tprice)));
    }
  }

  function showCustomerChart() {
    var balloonText = "<span style='font-size:11px;'>[[title]] :<b>[[value]]</b></span>";
    var graphs = [];
    var legend = {
      position: "bottom",
      valueText: "[[value]]",
      valueWidth: 100,
      valueAlign: "left",
      equalWidths: false,
      periodValueText: "[[value.sum]]"
    };

    if (chartData.length > 1) {
      allNames.forEach(function(name) {
        graphs.push({
          type: "line",
          title: name,
          valueField: name,
          lineAlpha: 0,
          fillAlphas: 0.7,
          balloonText: balloonText
        });
      });

      chart = AmCharts.makeChart("stat-chartdiv", {
        type: "serial",
        dataProvider: chartData,
        marginTop: 10,
        categoryField: "month",

        categoryAxis: {
          gridAlpha: 0.07,
          axisColor: "#DADADA",
          minorGridEnabled: true,

          guides: [{
            lineColor: "#CC0000",
            inside: true,
            value: 10,
            toValue: 20,
            fillColor: "#00CC00",
            fillAlpha: 0.2
          }]
        },
        valueAxes: [{
          stackType: "regular",
          gridAlpha: 0.07,
          title: "金额"
        }],

        graphs: graphs,
        legend: legend,
        chartCursor: { }
      });
    }
    else if (chartData.length === 1) {
      for (var key in titleEN2CN) {
        if (titleEN2CN.hasOwnProperty(key)) {
          if (key === 'totalPrice') {
            graphs.push({
              type: "line",
              title: titleEN2CN[key],
              valueField: key,
              lineThickness: 2,
              bullet: "round",
              balloonText: balloonText
            });
          } else {
            graphs.push({
              type: "column",
              title: titleEN2CN[key],
              valueField: key,
              fillAlphas: 1,
              balloonText: balloonText
            });
          }
        }
      }

      chart = AmCharts.makeChart("stat-chartdiv", {
        type: "serial",
        dataProvider: dbData,
        categoryField: "name",
        rotate: true,

        valueAxes: [{
          position: "top",
          title: "吨数/价格 " + startDate.format("YYYY-MM"),
          minorGridEnabled: true
        }],
        graphs: graphs,
        legend: legend,
        categoryAxis: { gridPosition: "start" },
        creditsPosition:"top-right"
      });
    }
  }

  function customerChart() {
    if (chartData.length === 0 && allNames.length) {
      $('body').css({'cursor': 'wait'});
      var obj = { fName: billNameFilter.selected, fDate1: startDate.toISOString(), fDate2: endDate.toISOString(), fMonths: getMonthList() };
      $.get('/get_customer_chart_data', obj, function (data) {
        var result = jQuery.parseJSON(data);
        if (result.ok) {
          chartData = result.chart_data;
          showCustomerChart();
        }

        $('body').css({'cursor': 'default'});
      });
    }
    else {
      showCustomerChart();
    }
  }

  function vesselChart() {
    if (chart) {
      chart.clear();
    }

    chartData = [];

    if (chartWeight) {
      dbData.forEach(function(vv) {
        chartData.push({
          month: vv.month,
          '车总吨位': vv.vhTotal,
          '自有车吨位': vv.vhOwnWeight,
          '外挂车吨位': vv.vhNonOwnWeight,
          '船总吨位': vv.vsTotal,
          '自有船吨位': vv.vsOwnWeight,
          '外挂船吨位': vv.vsNonOwnWeight
        });
      });
      allNames = ['车总吨位', '自有车吨位', '外挂车吨位', '船总吨位', '自有船吨位', '外挂船吨位'];
    } else {
      dbData.forEach(function(vv) {
        chartData.push({
          month: vv.month,
          '车总金额': vv.vhRevenue,
          '自有车收金额': vv.vhOwnIncome,
          '外挂车收金额': vv.vhNonOwnIncome,
          '外挂车付金额': vv.vhNonOwnDeposit,
          '船总金额': vv.vsRevenue,
          '自有船收金额': vv.vsOwnIncome,
          '外挂船收金额': vv.vsNonOwnIncome,
          '外挂船付金额': vv.vsNonOwnDeposit
        });
      });
      allNames = ['车总金额', '自有车收金额', '外挂车收金额', '外挂车付金额', '船总金额', '自有船收金额', '外挂船收金额', '外挂船付金额'];
    }

    var balloonText = "<span style='font-size:11px;'>[[title]] :<b>[[value]]</b></span>";
    var legend = {
      position: "bottom",
      valueText: "[[value]]",
      valueWidth: 100,
      valueAlign: "left",
      equalWidths: false,
      periodValueText: "[[value.sum]]"
    };

    chart = new AmCharts.AmSerialChart();
    chart.dataProvider = chartData;
    chart.categoryField = 'month';

    var categoryAxis = chart.categoryAxis;
//    categoryAxis.labelRotation = 45; // this line makes category values to be rotated
    categoryAxis.gridAlpha = 0;
    categoryAxis.fillAlpha = 1;
    categoryAxis.fillColor = "#FAFAFA";
    categoryAxis.gridPosition = "start";

    // value
    var valueAxis = new AmCharts.ValueAxis();
    valueAxis.dashLength = 5;
    valueAxis.title = "重量";
    valueAxis.axisAlpha = 0;
    chart.addValueAxis(valueAxis);

    allNames.forEach(function(name) {
      var graph = new AmCharts.AmGraph();
      graph.title = name;
      graph.valueField = name;
//      graph.colorField = "color";
      graph.balloonText = balloonText;
      graph.type = "column";
      graph.lineAlpha = 0;
      graph.fillAlphas = 1;
      chart.addGraph(graph);
    });

    // CURSOR
    var chartCursor = new AmCharts.ChartCursor();
    chartCursor.cursorAlpha = 0;
    chartCursor.zoomable = false;
    chartCursor.categoryBalloonEnabled = false;
    chart.addChartCursor(chartCursor);

    chart.creditsPosition = "top-right";
    chart.legend = legend;

    // WRITE
    chart.write("stat-chartdiv");
  }

  ckShowDiagram.on('ifUnchecked', function() {
    showHtmlElement($('#stat-chartdiv'), false);
    showHtmlElement($('#stat-table'), true);
    showHtmlElement($('#chart-option'), false);
  });

  ckShowDiagram.on('ifChecked', function() {
    showHtmlElement($('#stat-chartdiv'), true);
    showHtmlElement($('#stat-table'), false);
    showHtmlElement($('#chart-option'), true);

    if (chart) {
      chart.clear();
    }

    if (action === "VESSEL") {
      vesselChart();
    } else {
      customerChart();
    }
  });

  $('#statistics-condition').on('click', function() {
    ckShowDiagram.iCheck('uncheck');
    startDate = null;
    endDate = null;
    $('.input-group.date').find('input').each(function() {
      this.value = '';
    });

    setHtmlElementDisabled(btnOk, true);
    $('#radio_month').iCheck('check');
    $('#stat-condition-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
  });

  btnOk.on('click', function() {
    $('#stat-condition-dialog').modal('hide');
    nlApp.setTitle('数据分析, 请稍等...');
    nlApp.showPleaseWait();

    if (action === "CUSTOMER") {
      var caption = $('#table-caption');
      caption.text(startDate.format("YYYY-MM") + " 到 " + moment(endDate).subtract(1, "months").format("YYYY-MM") + " 月份数据");
      showHtmlElement(caption, true);

      generateCustomerData();
    }
    else if (action === "VESSEL") {
      generateVesselData();
    }
  });

  function showVesselDetail(isSummary, vehType, month) {
    $('body').css({'cursor':'wait'});
    var s = moment(month).startOf('month');
    var e = moment(s).add(1, 'months');
    var obj = { fDate1: s.toISOString(), fDate2: e.toISOString(), fVehType: vehType };

    if (isSummary) {
      $('#summary-dialog-title').text((vehType === '外挂' ? '车船外挂统计:' + month : '车船自有统计:' + month));
      obj.fSummary = 'YES';
      $.get('/get_vessel_alloc_detail', obj, function (data) {
        var result = jQuery.parseJSON(data);
        if (result.ok) {
          var one = result.summary_data;
          var fmt = '<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td></tr>';

          detailTBody.empty();
          for (var key in one) {
            if (one.hasOwnProperty(key)) {
              detailTBody.append(fmt.format(key, getStrValue(one[key].weight), getStrValue(one[key].amount), one[key].contact));
            }
          }

          $('#stat-detail-dialog').modal({backdrop: 'static', keyboard: false}).modal('show');
        } else {
          bootbox.alert('查询数据出错');
        }

        $('body').css({'cursor':'default'});
      });
    }
    else {
      $('#detail-title').text((vehType === '外挂' ? '车船外挂明细:' + month : '车船自有明细:' + month));
      obj.fSummary = 'NO';
      $.get('/get_vessel_alloc_detail', obj, function (data) {
        var result = jQuery.parseJSON(data);
        if (result.ok) {
          var vObj = result.vessel_detail;
          var nameList = result.vehNameList;

          var trStr = '<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td></tr>';
          vesselDetailBody.empty();
          nameList.forEach(function(name) {
            if (vObj.hasOwnProperty(name)) {
              vObj[name].forEach(function (t) {
                vesselDetailBody.append(trStr.format(name, t.name, t.ship_from, t.ship_to, getStrValue(t.price), getStrValue(t.single_price), t.send_num,
                  getStrValue(t.send_weight), date2Str(t.ship_date), t.advance_mode + ':' + getStrValue(t.advance_charge), t.delay_day));
              })
            }
          });

          $('#vessel-detail-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
        } else {
          bootbox.alert('不能获取明细数据');
        }

        $('body').css({'cursor':'default'});
      });
    }
  }

  function showCustomerDetail(nameList) {
    if (startDate && endDate) {
      $('body').css({'cursor': 'wait'});

      detailTBody.empty();
      var obj = {
        fName: nameList,
        fDate1: startDate.toISOString(),
        fDate2: endDate.toISOString(),
        fMonths: getMonthList()
      };
      $.get('/get_customer_detail', obj, function (data) {
        var result = jQuery.parseJSON(data);
        if (result.ok) {
          var trHtml = '<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td><td>{11}</td><td>{12}</td><td>{13}</td><td>{14}</td><td>{15}</td></tr>';
          result.detail_data.forEach(function (item) {
            detailTBody.append(trHtml.format(item.order, item.bill_no, item.name, item.veh_ves_name, item.ship_to,
              item.coll_price, item.price, item.tot_price, item.send_num, item.send_weight,
              date2Str(item.ship_date), item.inv_no, item.warehouse, item.spec, item.brand_no, item.contract_no));
          });

          $('#price-detail-dialog').modal({backdrop: 'static', keyboard: false}).modal('show');
        } else {
          bootbox.alert('获取明细出错');
        }

        $('body').css({'cursor': 'default'});
      });
    }
  }

  if (action === "VESSEL") {
    var vesselDetailBody = $('#vessel-detail-tbodys');
    var summary = false;
    var vehType;

    function showDetailDialog(isSummary, category) {
      if (dbData.length === 0) {
        bootbox.alert("还没有数据,请设置查询日期");
      } else {
        summary = isSummary;
        vehType = category;
        if (dbData.length > 1) {
          var mList = [];
          dbData.forEach(function (item) {
            mList.push(item.month);
          });

          initSelect($('#detail-month'), mList, false);
          $('#choose-month-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
        } else {
          showVesselDetail(summary, category, dbData[0].month);
        }
      }
    }

    // button function handle
    $('#deposit-detail').on('click', function () { showDetailDialog(true, '外挂'); });
    $('#vessel-deposit-detail').on('click', function () { showDetailDialog(false, '外挂'); });
    $('#own-detail').on('click', function () { showDetailDialog(true, '自有'); });
    $('#vessel-own-detail').on('click', function () { showDetailDialog(false, '自有'); });

    // after select month, and show data if click OK
    $('#choose-month-ok').on('click', function () {
      var month = $('#detail-month').val();
      if (month) {
        showVesselDetail(summary, vehType, month);
      }
    });
  }
  else {  // CUSTOMER
    $('#price-detail').on('click', function () {
      showCustomerDetail(billNameFilter.selected);
    });

    $('#single-customer-detail').on('click', function() {
      if (dbData.length === 0) {
        bootbox.alert("还没有数据,请设置查询日期");
      } else {
        if (dbData.length > 1) {
          initSelect($('#customer-list'), allNames, false);
          $('#choose-customer-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
        } else {
          showCustomerDetail([dbData[0].name]);
        }
      }
    });

    $('#choose-customer-ok').on('click', function () {
      var customer = $('#customer-list').val();
      if (customer) {
        showCustomerDetail([customer]);
      }
    });
  }

  elementEventRegister($('#export-detail'), 'click', function() {  tableToExcel($('#detail-table').html(), "data"); });
  elementEventRegister($('#export-vessel-detail'), 'click', function() {  tableToExcel($('#vessel-detail-table').html(), "data"); });

  $('#radio_month').on('ifChecked', function() {
    showHtmlElement($('#year-choose'), false);
    showHtmlElement($('#non-year-choose'), true);
    showHtmlElement($('#month-choose'), false);
  });

  $('#radio_single_year').on('ifChecked', function() {
    showHtmlElement($('#year-choose'), true);
    showHtmlElement($('#non-year-choose'), false);
    showHtmlElement($('#month-choose'), false);
  });

  $('#radio_single_month').on('ifChecked', function() {
    showHtmlElement($('#month-choose'), true);
    showHtmlElement($('#year-choose'), false);
    showHtmlElement($('#non-year-choose'), false);
  });

  $('#chart-weight').on('ifChecked', function() {
    chartWeight = true;
    vesselChart();
  });

  $('#chart-amount').on('ifChecked', function() {
    chartWeight = false;
    vesselChart();
  });

  $('#show-zero-space').on('ifChecked', function() { showCustomerData(true); });
  $('#show-zero-space').on('ifUnchecked', function() { showCustomerData(false); });

  elementEventRegister($('#search-export'), 'click', function() {  tableToExcel($('#stat-table').html(), "data"); });

  function initial() {
    var opts = getDateTimePickerOptions();

    opts.minViewMode = 'months';
    opts.format = 'YYYY-MM';
    startDateGrp.datetimepicker(opts).on('dp.change', dateChanged);
    endDateGrp.datetimepicker(opts).on('dp.change', dateChanged);
    monthGrp.datetimepicker(opts).on('dp.change', dateChanged);

    opts.minViewMode = 'years';
    opts.format = 'YYYY';
    yearGrp.datetimepicker(opts).on('dp.change', dateChanged);
  }


  // Popup menu when right mouse click.
  var nlContextMenu = $("#nlContextMenu");
  var custDetailMenuItem = $('#show-customer-detail');
  var selectedMonth,
      selectedCustomer;

  $("body").on("contextmenu", "table tbody tr", function(e) {
    nlContextMenu.css({
      display: "block",
      left: e.pageX,
      top: e.pageY
    });

    var tr = $(this).closest('tr');
    var row = tr.index();
    if (action === 'CUSTOMER') {
      selectedCustomer = getTableCellChildren(tr, 0).text();
      custDetailMenuItem.text('显示' + selectedCustomer + '明细');
    } else {
      selectedMonth = moment(startDate).add(row / 2, 'months').format('YYYY-MM');
    }

    return false;
  });

  nlContextMenu.on("click", function() { nlContextMenu.hide(); });
  $("section").on('click', function() { nlContextMenu.hide(); });

  custDetailMenuItem.on('click', function() {
    if (selectedCustomer) showCustomerDetail([selectedCustomer]);

    return false;
  });

  $('#show-own-summary').on('click', function() {
    if (selectedMonth) {
      showVesselDetail(true, '自有', selectedMonth);
    }

    return false;
  });
  $('#show-own-detail').on('click', function() {
    if (selectedMonth) {
      showVesselDetail(false, '自有', selectedMonth);
    }

    return false;
  });

  $('#show-deposit-summary').on('click', function() {
    if (selectedMonth) {
      showVesselDetail(true, '外挂', selectedMonth);
    }

    return false;
  });
  $('#show-deposit-detail').on('click', function() {
    if (selectedMonth) {
      showVesselDetail(false, '外挂', selectedMonth);
    }

    return false;
  });
});
