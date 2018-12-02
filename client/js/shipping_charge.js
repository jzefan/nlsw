/**
 * Created by jzefan on 2018/3/4.
 */

$(function () {
  "use strict";

  var tableBody        = $('#table-tbody');
  var btnExport        = $('#search-export');
  var btnShowDetail    = $('#show-detail');
  var btnPrintDetail   = $('#settle-print-detail');
  var printBody        = $('#print-detail-tbody');
  var totalAmount = 0;
  var totalWeight = 0;

  var dbRecords =    [];
  var curr_records = []; // 存放查询得到的所有记录
  var selected_records = [];
  var prices = undefined;

  var qFilter = new QueryFilterD(local_data);
  qFilter.eventHandler(filterData);

  function filterData(needUpdateDbData, emptyDbData) {
    if (needUpdateDbData) {
      $.get('/get_invoice_report', qFilter.getQueryParams(), function (data) {
        var result = jQuery.parseJSON(data);
        dbRecords = [];
        if (result.ok) {
          if (result.hint) {
            var msg = '查询到的数据记录为：' + result.num + ', (全部显示会比较慢，请进一步缩小查询条件！)';
            bootbox.alert(msg);
            prices = undefined;
          } else {
            prices = result.prices;
          }

          dbRecords = sortByKey(result.invs, "ship_date", "DSC");
          curr_records = sortByKey(result.invs, "ship_date", "DSC");
        } else {
          curr_records = [];
        }

        qFilter.updateOptions(curr_records);
        resetTableRow();
      });
    } else {
      if (emptyDbData) {
        dbRecords = [];
      }
      curr_records = qFilter.updateOptions(dbRecords);
      resetTableRow();
    }
  }

  elementEventRegister(btnShowDetail, 'click', function() {
    if (selected_records.length > 0) {
      var inv = selected_records[0];
      var isVessel = false;
      inv.bills.forEach(function (bill) {
        if (bill.vehicles.length) {
          isVessel = true;
        }
      });

      $.get('/get_waybill', { q: inv.waybill_no }, function (data) {
        var obj = jQuery.parseJSON(data); // bills: bills, invoices: invoices
        var allBills = obj.bills;
        var html = "";
        allBills.forEach(function (b) {
          var p = 0;
          if (b.customer_price > 0) {
            p = b.collection_price > 0 ? b.collection_price + b.customer_price : b.customer_price;
          } else {
            p = b.collection_price > 0 ? b.collection_price : 0;
          }

          for (var i = 0; i < inv.bills.length; ++i) {
            var ib = inv.bills[i];
            if (String(b._id) === String(ib.bill_id)) {
              html += buildTableTr(b, ib.num, ib.weight);

              var w = 0;
              var vp = 18; // 船只固定要18元;
              if (ib.weight > 0) {
                w = p * ib.weight;
              } else {
                if (ib.vehicles.length) {
                  ib.vehicles.forEach(function (veh) {
                    w += veh.send_weight;
                    vp += veh.send_weight * veh.veh_price;
                  });
                } else if (b.block_num > 0) {
                  w = ib.num * b.weight;
                }
              }

              //customer_price += p * w;
              //veh_price += vp;


              if (ib.vehicles.length) {
                var str = "";
                ib.vehicles.forEach(function (veh) {
                  str = "{0}, <code>重量:{1}</code><code>单价:{2}</code><code>价格:{3}</code><br />".format(veh.veh_name,
                    getStrValue(veh.send_weight), getStrValue(veh.veh_price),
                    veh.veh_price > 0 ? getStrValue(veh.veh_price * veh.send_weight) : 0);
                });
                html += "<td>" + str + "</td></tr>";
              } else {
                html += "<td></td></tr>";
              }
              break;
            }
          }
        });

        $('#tb-detail-tbody').html(html);

        showHtmlElement($('#tb-detail th:last-child, #tb-detail td:last-child'), isVessel);
        $('#settle-detail-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
      });
    }
  });

  function buildTableTr(bill, send_num, send_weight) {
    var str = '<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td><td>{11}</td><td>{12}</td>';
    if (bill.block_num > 0) {
      return str.format(bill.bill_no, getOrder(bill.order_no, bill.order_item_no), bill.ship_warehouse? bill.ship_warehouse : "",
        getStrValue(bill.thickness), getStrValue(bill.width), getStrValue(bill.len),
        getStrValue(bill.weight), bill.block_num, getStrValue(bill.total_weight), send_num, getStrValue(bill.weight * send_num),
        bill.customer_price > 0 ? getStrValue(bill.customer_price) : 0,
        bill.collection_price > 0 ? getStrValue(bill.collection_price) : 0)
    } else {
      return str.format(bill.bill_no, getOrder(bill.order_no, bill.order_item_no), bill.ship_warehouse? bill.ship_warehouse : "",
        getStrValue(bill.thickness), getStrValue(bill.width), getStrValue(bill.len),
        "", "", getStrValue(bill.total_weight), send_num, getStrValue(send_weight),
        bill.customer_price > 0 ? getStrValue(bill.customer_price) : 0,
        bill.collection_price > 0 ? getStrValue(bill.collection_price) : 0 )
    }
  }

  btnPrintDetail.on('click', function() {
    if (selected_records.length) {
      printBody.empty();
      var trStr = '<tr><td style="border:1px solid black;padding:5px;">{0}</td>' +
        '<td style="border:1px solid black;padding:5px;">{1}</td>' +
        '<td style="border:1px solid black;padding:5px;">{2}</td>' +
        '<td style="border:1px solid black;padding:5px;">{3}</td>' +
        '<td style="border:1px solid black;padding:5px;">{4}</td>' +
        '<td style="border:1px solid black;padding:5px;">{5}</td>' +
        '<td style="border:1px solid black;padding:5px;">{6}</td>' +
        '<td style="border:1px solid black;padding:5px;">{7}</td>' +
        '<td style="border:1px solid black;padding:5px;">{8}</td>' +
        '<td style="border:1px solid black;padding:5px;">{9}</td></tr>';
      var totWeight = 0, totPrice = 0;
      var numOfRow = tableBody.find("tr").length;
      for (var i = 0; i < numOfRow; ++i) {
        var tr = getRowChildren(tableBody, i);
        var check = getTableCellChildren(tr, 0).find("input");
        if (check.is(":checked")) {
          var w = getTableCellChildren(tr, 10).text();
          var p = getTableCellChildren(tr, 7).text();
          printBody.append(trStr.format(getTableCellChildren(tr, 3).text(),
            getTableCellChildren(tr, 4).text(),
            getTableCellChildren(tr, 5).text(),
            getTableCellChildren(tr, 6).text(),
            w, getTableCellChildren(tr, 8).text(), p,
            getTableCellChildren(tr, 11).text(),
            getTableCellChildren(tr, 14).text(),
            getTableCellChildren(tr, 15).text() ));
          totWeight += (+w);
          totPrice += (+p);
        }
      }

      $('#print-total-weight').text(getStrValue(totWeight));
      $('#print-total-number').text(getStrValue(totPrice));
      $('#settle-print-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
    } else {
      bootbox.alert('请选择你要打印的清单列表');
    }
  });

  $('#print-to').on('click', function() {
    var w = window.open();
    if (!w) {
      bootbox.alert('请允许弹出窗口!');
      return false;
    } else {
      w.document.write($('#print-div').html());
      w.print();
      w.close();
      return true;
    }
  });

  ////////////////////////////////////////////////////////////////////////////////////////////////////////
  /// Function list
  ////////////////////////////////////////////////////////////////////////////////////////////////////////
  function makeInvVehInfo(invoice) {
    var allVehicles = [];
    invoice.bills.forEach(function(bill) {
      allVehicles.push.apply(allVehicles, bill.vehicles);
    });

    var vehObj = {};
    allVehicles.forEach(function(veh) {
      if (isExist(vehObj[veh.inner_waybill_no])) {
        vehObj[veh.inner_waybill_no].num += veh.send_num;
        vehObj[veh.inner_waybill_no].weight += veh.send_weight;
      } else {
        vehObj[veh.inner_waybill_no] = {
          name: veh.veh_name,
          num: veh.send_num,
          weight: veh.send_weight,
          price: isExist(veh.veh_price) ? veh.veh_price : 0,
          ship_from: veh.veh_ship_from,
          state: '未结算', date: null,
          unship_date: null, delay_day: 0, advance_charge_mode: '现金', advance_charge: 0, receipt: 0, remark: '',
          pay_date: null
        };
      }
    });

    if (isExist(invoice.inner_settle) && !isEmpty(invoice.inner_settle)) {
      invoice.inner_settle.forEach(function(innset) {
        vehObj[innset.inner_waybill_no].state = innset.state;
        vehObj[innset.inner_waybill_no].date = innset.date;
        vehObj[innset.inner_waybill_no].unship_date = innset.unship_date;
        vehObj[innset.inner_waybill_no].delay_day = innset.delay_day;
        vehObj[innset.inner_waybill_no].advance_charge_mode = innset.advance_charge_mode;
        vehObj[innset.inner_waybill_no].advance_charge = innset.advance_charge;
        vehObj[innset.inner_waybill_no].receipt = innset.receipt;
        vehObj[innset.inner_waybill_no].remark = innset.remark;
        vehObj[innset.inner_waybill_no].pay_date = innset.pay_date;
      })
    }

    return vehObj;
  }

  function getParameterText(state, receipt, mode, charge_value, remark) {
    var color = (state === '不需要结算') ? "gray" : "red";
    var show = remark ? "" : "display:none";
    var checked = (receipt === 1) ? "checked" : "";
    var ckReceipt = '<input class="select-receipt" type="checkbox" disabled ' + checked + '>&nbsp;<i class="fa fa-info-circle" style="color:red; cursor:pointer; ' + show + '" data-toggle="tooltip" title="' + remark + '"></i>';

    return { state: getStrByStatus(state, state),
      color: color, ckReceipt: ckReceipt, chargeText: mode + ": " + (typeof charge_value === 'number' ? charge_value : '0') };
  }

  var allInvVehicles = [];
  function makeTableTrHtml(inv) {
    var isVessel = false;
    var vehObj = null;
    var number = 0;
    inv.bills.forEach(function(bill) {
      number += bill.num;
      if (!isVessel && bill.vehicles.length) {
        isVessel = true;

        /*
        var found = false;
        for (var k = 0, len = allInvVehicles.length; k < len; ++k) {
          if (inv.waybill_no === allInvVehicles[k].wno) {
            vehObj = allInvVehicles[k].vehInfo;
            break;
            found = true;
          }
        }

        if (!found) {
          vehObj = makeInvVehInfo(inv);
          allInvVehicles.push({ wno: inv.waybill_no, vehInfo: vehObj });
        }
        */
      }
    });

    var name = inv.ship_name + (inv.ship_customer ? "/" + inv.ship_customer : "");
    var paramText = getParameterText(inv.vessel_settle_state, inv.receipt, inv.advance_charge_mode, inv.advance_charge, inv.remark);

    var trHtml = '<tr class="tr_header"><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td><td>{11}</td></tr>';

    var pText = getInvVesselPriceText(vehObj, inv);
    totalAmount += pText.price;
    totalWeight += inv.total_weight;

    if (undefined != prices) {
      var price = prices[inv.waybill_no];

      tableBody.append(trHtml.format(
        paramText.state,
        name,
        inv.vehicle_vessel_name,
        inv.ship_to,
        number,
        getStrValue(inv.total_weight),
        getStrValue(price.cust_price),
        pText.priceText,
        getStrValue(price.net_income),
        date2Str(inv.ship_date),
        inv.shipper,
        inv.waybill_no));
    } else {
      tableBody.append(trHtml.format(
        paramText.state,
        name,
        inv.vehicle_vessel_name,
        inv.ship_to,
        number,
        getStrValue(inv.total_weight), '...', '...', '...',
        date2Str(inv.ship_date),
        inv.shipper,
        inv.waybill_no));
    }
  }

  function resetTableRow() {
    tableBody.empty();
    selected_records = [];
    totalAmount = 0;
    totalWeight = 0;
    allInvVehicles = [];

    curr_records.forEach(function (inv) {
      makeTableTrHtml(inv);
    });

    //$('#lb-total-weight').text(getStrValue(totalWeight));
    //$('#lb-total-amount').text(getStrValue(totalAmount));
    //$('#curr-number').text(tableBody.find("tr").length);

    //enableButtons();

    $('.tr_header').on('click', function () { selectRow($(this)); });
    $('[data-toggle="popover"]').popover({ trigger: "hover", html: true, placement: "bottom" });
  }

  function selectRow(me) {
    if (me.hasClass("tr_header")) {
      tableBody.find('tr').removeClass('invoice-highlighted');
      selected_records = [];
      var wno = getTableCellChildren(me, 11).text();
      for (var k = 0, l = curr_records.length; k < l; ++k) {
        if (wno === curr_records[k].waybill_no) {
          selected_records.push(curr_records[k]);
          break;
        }
      }

      me.addClass('invoice-highlighted');
      //var found = false;
      //for (var i = 0; i < selected_records.length; ++i) {
      //  if (wno === selected_records[i].waybill_no) {
      //    selected_records.remove(i);
      //    found = true;
      //    break;
      //  }
      //}
      //
      //if (found) {
      //  me.removeClass('invoice-highlighted');
      //} else {
      //  for (var k = 0, l = curr_records.length; k < l; ++k) {
      //    if (wno === curr_records[k].waybill_no) {
      //      selected_records.push(curr_records[k]);
      //      break;
      //    }
      //  }
      //  me.addClass('invoice-highlighted');
      //}
    }
  }

  function getInvVesselPriceText(vehObj, inv) {
    var tip = "";
    if (inv.vessel_price > 0) {
      tip += '车船号:{0}, 发运重量:{1}, 单价:{2}, 目的地:{3}'.format(inv.vehicle_vessel_name, getStrValue(inv.total_weight), getStrValue(inv.vessel_price), inv.ship_to);
    }

    if (vehObj) {
      var i = 1;
      for (var key in vehObj) {
        if (vehObj.hasOwnProperty(key)) {
          tip += '\r第{0}车: {1}, 发运重量:{2}, 单价:{3}, 目的地:{4}'.format(i, vehObj[key].name, getStrValue(vehObj[key].weight),
            vehObj[key].price < 0 ? '无' : getStrValue(vehObj[key].price), inv.vehicle_vessel_name);
          ++i
        }
      }
    }

    if (inv.veh_price <= 0) { //vessel_price < 0) {
      return { priceText: '<code style="color: darkgray">无</code>', tooltip: tip, price: 0 };
    } else {
      var price = prices[inv.waybill_no];
      return {
        priceText: '<code style="color: blue">' + getStrValue(price.veh_price) + '</code>',
        tooltip: tip,
        price: price.veh_price
      };
    }
  }

  elementEventRegister(btnExport, 'click', function() {  tableToExcel($('#table-content').html(), "data"); });

});

/////////////////////////////////////////
//////// CLASS DEFINE ///////////////////
/////////////////////////////////////////
var QueryFilterD = function(options) {
  this.uiElems = {
    sBfBillName : $('#bf-shipping-name'),
    sBfDest : $('#bf-destination'),
    sBfVehicle : $('#bf-vehicle'),
    startDateGrp : $('#start-date-grp'),
    endDateGrp : $('#end-date-grp'),
    iStartDate : $('#start-date'),
    iEndDate : $('#end-date'),
    sBfShipper: $('#bf-shipper')
  };

  this.options = options;
  initSelect(this.uiElems.sBfBillName, options.ship_name, true);
  initSelect(this.uiElems.sBfVehicle, options.vehicles, true);
  initSelect(this.uiElems.sBfDest, options.destination, true);
  initSelect(this.uiElems.sBfShipper, options.users, true);
  this.uiElems.iStartDate.val("");
  this.uiElems.iEndDate.val("");

  this.uiElems.sBfBillName.select2({allowClear:true});
  this.uiElems.sBfVehicle.select2({allowClear:true});
  this.uiElems.sBfDest.select2({allowClear:true});
  this.uiElems.sBfShipper.select2({allowClear:true});

  this.currSelected = 0;
  this.first = -1;
  this.selectedVeh = null;
  this.selectedName = null;
  this.selectedDest = null;
  this.selectedUser = null;
  this.sDate = null;
  this.eDate = null;

  this._selectFliterFunc = function(which, value, filter) {
    if (this.first < 0) {
      this.first = which;
    }

    if (value === '无-取消选择') {
      if (this.first === which) {
        this.first = -1;
      }
      switch (which) {
        case 1:
          this.selectedName = null; break;
        case 3:
          this.selectedVeh = null; break;
        case 4:
          this.selectedDest = null; break;
        case 6:
          this.selectedUser = null; break;
      }
    }

    this.currSelected = which;
    filter(true, false);
  };

  this._dateFilterFunc = function(isStart, isEnd, filter) {
    var d1 = this.uiElems.iStartDate.val();
    var d2 = this.uiElems.iEndDate.val();
    var b = false;
    if (isStart && isEnd) {
      b = !isEmpty(d1) && !isEmpty(d2);
    } else if (isStart) {
      b = isEmpty(this.uiElems.iStartDate.val());
    } else if (isEnd) {
      b = isEmpty(this.uiElems.iEndDate.val());
    }

    if (b) {
      this.currSelected = 5;
      filter(true, false);
    }
  };

  this._initSelect = function(nOptions) {
    if (this.first !== 1 || this.currSelected !== 1) {
      initSelect(this.uiElems.sBfBillName, nOptions.ship_name, true);
      if (this.selectedName) {
        this.uiElems.sBfBillName.select2('val', this.selectedName);
      } else {
        this.uiElems.sBfBillName.select2('val', '');
      }
    }

    if (this.first !== 3 || this.currSelected !== 3) {
      initSelect(this.uiElems.sBfVehicle, nOptions.vehicles, true);
      if (this.selectedVeh) {
        this.uiElems.sBfVehicle.select2('val', this.selectedVeh);
      } else {
        this.uiElems.sBfVehicle.select2('val', '');
      }
    }

    if (this.first !== 4 || this.currSelected !== 4) {
      initSelect(this.uiElems.sBfDest, nOptions.destination, true);
      if (this.selectedDest) {
        this.uiElems.sBfDest.select2('val', this.selectedDest);
      } else {
        this.uiElems.sBfDest.select2('val', '');
      }
    }
    //if (this.first !== 6) {
    //  initSelect(this.uiElems.sBfShipper, nOptions., true);
    //  if (this.selectedDest) {
    //    this.uiElems.sBfDest.select2('val', this.selectedDest);
    //  } else {
    //    this.uiElems.sBfDest.select2('val', '');
    //  }
    //}
  }
};

QueryFilterD.prototype.getQueryParams = function() {
  var d1 = this.uiElems.iStartDate.val();
  var d2 = this.uiElems.iEndDate.val();
  var b = !isEmpty(d1) && !isEmpty(d2);

  return {
    fName: this.selectedName,
    fVeh: this.selectedVeh,
    fDest: this.selectedDest,
    fShipper: this.selectedUser,
    fDate1: b ? this.sDate.toISOString() : null,
    fDate2: b ? this.eDate.toISOString(): null
  };
};

QueryFilterD.prototype.getVehicleName = function() {
  return this.selectedVeh;
};

QueryFilterD.prototype.eventHandler = function(filter) {
  var self = this;
  self.uiElems.sBfBillName.on('change', function(e) {
    self.selectedName = e.val;
    self._selectFliterFunc(1, e.val, filter);
  });
  self.uiElems.sBfVehicle.on('change', function(e) {
    self.selectedVeh = e.val;
    self._selectFliterFunc(3, e.val, filter);
  });

  self.uiElems.sBfShipper.on('change', function(e) {
    self.selectedUser = e.val;
    self._selectFliterFunc(6, e.val, filter);
  });
  self.uiElems.sBfDest.on('change', function(e) {
    self.selectedDest = e.val;
    self._selectFliterFunc(4, e.val, filter);
  });

  self.uiElems.startDateGrp.datetimepicker(getDateTimePickerOptions()).on('dp.change', function(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    self.sDate = e.date.startOf('day');
    self.uiElems.endDateGrp.data("DateTimePicker").setMinDate(e.date);
    self._dateFilterFunc(true, true, filter);
  });
  self.uiElems.endDateGrp.datetimepicker(getDateTimePickerOptions()).on('dp.change', function(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    self.eDate = e.date.endOf('day');
    self.uiElems.startDateGrp.data("DateTimePicker").setMaxDate(e.date);
    self._dateFilterFunc(true, true, filter);
  });
  self.uiElems.iStartDate.on('change', function(e) {
    e.stopImmediatePropagation();
    self._dateFilterFunc(true, false, filter);
  });
  self.uiElems.iEndDate.on('change', function(e) {
    e.stopImmediatePropagation();
    self._dateFilterFunc(false, true, filter);
  });
};

QueryFilterD.prototype.isAllEmpty = function() {
  var shipper = getSelectValue(this.uiElems.sBfShipper);
  var d1 = this.uiElems.iStartDate.val();
  var d2 = this.uiElems.iEndDate.val();
  return isEmpty(this.selectedVeh) && isEmpty(this.selectedDest) && isEmpty(this.selectedName) &&
      isEmpty(shipper) && isEmpty(d1) && isEmpty(d2);
};

QueryFilterD.prototype.updateOptions = function(records) {
  var vehicle = this.selectedVeh;
  var dest = this.selectedDest;
  var name = this.selectedName;
  var nOptions = {ship_name: [], vehicles: [], destination: [], users: this.options.users };

  if (this.first < 0) {
    nOptions = this.options;
  } else {
    var vName = [], vList = [], dList = [], k, m;

    records.forEach(function (rec) {
      if (vName.indexOf(rec.ship_name) < 0) {
        vName.push(rec.ship_name);
      }

      var b2 = false;
      if (vehicle) {
        if (vehicle === rec.vehicle_vessel_name) {
          b2 = true;
        } else {
          for (k = 0; k < rec.bills.length; ++k) {
            for (m = 0; m < rec.bills[k].vehicles.length && !b2; ++m) {
              if (rec.bills[k].vehicles[m].veh_name === vehicle) {
                b2 = true;
                break;
              }
            }
          }
        }
      } else {
        b2 = true;
      }

      var b3 = !dest || dest === rec.ship_to;
      var b4 = !name || name === rec.ship_name;
      if (b2 && b3 && b4) {
        if (rec.ship_to && dList.indexOf(rec.ship_to) < 0) {
          dList.push(rec.ship_to);
        }

        if (rec.vehicle_vessel_name && vList.indexOf(rec.vehicle_vessel_name) < 0) {
          vList.push(rec.vehicle_vessel_name);
        }

        for (k = 0; k < rec.bills.length; ++k) {
          for (m = 0; m < rec.bills[k].vehicles.length; ++m) {
            if (vList.indexOf(rec.bills[k].vehicles[m].veh_name) < 0) {
              vList.push(rec.bills[k].vehicles[m].veh_name);
            }
          }
        }
      }
    });

    nOptions.vehicles = sort_pinyin(vList);
    nOptions.destination = sort_pinyin(dList);
    nOptions.ship_name = sort_pinyin(vName);
  }

  this._initSelect(nOptions);
};
