/**
 * Created by ezefjia on 2016/7/29.
 */

var ShipBillD = function(ono) {
  this.no = ono;
  this.left_num = 0;
  this.allBills = [];
};

ShipBillD.prototype.getOptionWithTip = function(shipName) {
  return '<option {0} value="{1}" data-toggle="tooltip" title="{2}" data-html="true">{3}</option>'.format(
    this.left_num > 0 ? '' : 'disabled', this.no, this.getTip(shipName), this.no);
};

ShipBillD.prototype.getTip = function(name) {
  var tips = [];
  this.allBills.forEach(function (b) {
    if (b.billing_name === name) {
      tips.push(b.tip);
    }
  });
  return tips.join('\n');
};
ShipBillD.prototype.getOptions = function(name) {
  var opts = [];
  var result = {};
  this.allBills.forEach(function (b) {
    if (b.billing_name === name) {
      if (b.bill_no in result) {
        result[b.bill_no].push(b);
      } else {
        result[b.bill_no] = [ b ];
      }
    }
  });
  var keys = Object.keys(result);
  keys.sort();
  for (var i = 0; i < keys.length; ++i) {
    var key = keys[i];
    var tip = [];
    var left = 0;
    result[key].forEach(function (b) {
      tip.push(b.tip);
      left += b.left_num;
    });
    var tips = 'data-toggle="tooltip" title="{0}" data-html="true"'.format(tip.join('\n'));
    if (left > 0) {
      opts.push('<option value="' + key + '" ' + tips + '>' + key + '</option>');
    }
  }
  return opts;
};
ShipBillD.prototype.getBillTips = function(name, billNo) {
  var left = 0;
  var tips = [];
  this.allBills.forEach(function (b) {
    if (b.billing_name == name && b.bill_no == billNo) {
      left += b.left_num;
      tips.push(b.tip);
    }
  });
  return { left_num: left, tip: tips.join('\n') };
};
ShipBillD.prototype.find = function (bill) {
  var result = { found: false};
  for (var i = 0; i < this.allBills.length; ++i) {
    if (sameBill(bill, this.allBills[i])) {
      result.found = true;
      result.bill  = this.allBills[i];
      result.index = i;
      break;
    }
  }

  return result;
};

ShipBillD.prototype.findOne = function(bno, order) {
  for (var k = 0; k < this.allBills.length; ++k) {
    var b = this.allBills[k];
    if (order === getOrder(b.order_no, b.order_item_no) && bno === b.bill_no) {
      return b;
    }
  }

  return false;
};

ShipBillD.prototype.add = function (bill) {
  bill.selected = false;
  bill.select_number = 0;
  bill.left = 0;
  if (bill.left_num >= 0) {
    this.left_num += bill.left_num;
    bill.left = bill.left_num;  // left保存left_num, left_num是随着用户设置发运数动态的改变
  }
  setTip(bill, 0);
  bill.prev_select_num   = 0;
  bill.prev_wnum_danding = 0; // 单定的发运块数
  bill.wnum         = 0;  // 运单读入时的发运数 (来自数据库)
  bill.wnum_danding = 0;
  bill.vehicles = [];
  this.allBills.push(bill);
};

ShipBillD.prototype.save = function () {
  this.allBills.forEach(function (b) {
    if (b.selected) {
      b.selected      = false;
      b.select_number = 0;
      b.left          = b.left_num;
    }
  })
};

ShipBillD.prototype.saveToContinue = function() {
  this.allBills.forEach(function(bill) {
    if (bill.selected) {
      bill.prev_select_num = (bill.prev_select_num > 0) ? (bill.prev_select_num + bill.select_number) : bill.select_number;
      bill.select_number = 0;
      bill.left = bill.left_num;
      if (bill.block_num === 0) {
        bill.prev_wnum_danding = (bill.prev_wnum_danding > 0) ? (bill.prev_wnum_danding + bill.wnum_danding) : bill.wnum_danding;
        bill.wnum_danding = 0; // 当前界面下单定的发运块数
      }
    }
  })
};

ShipBillD.prototype.selectedWithWaybillNum = function (idx, openToNew, num) {
  var bill = this.allBills[idx];
  bill.openToNew = openToNew;
  if (num > 0) {
    bill.selected = true;
    if (openToNew) {
      bill.prev_select_num = num;
      bill.select_number = 0;
    } else {
      bill.select_number = num;
      if (bill.left_num >= 0) {
        this.left_num -= bill.left_num;
        bill.left_num = bill.left;
        bill.left = bill.left_num + num;
        this.left_num += bill.left_num;
      }
    }
    setTip(bill, num);
  }
};

ShipBillD.prototype.selected = function(bno, ino) {
  var bills = [];
  for (var i = 0, len = this.allBills.length; i < len; ++i) {
    if (this.allBills[i].left_num > 0 && this.allBills[i].bill_no === bno) {
      this.allBills[i].selected = true;
      this.allBills[i].inner_waybill_no = ino;
      bills.push(this.allBills[i]);
    }
  }

  return bills;
};

ShipBillD.prototype.hasSelected = function() {
  for (var k = 0; k < this.allBills.length; ++k) {
    var bill = this.allBills[k];
    if (bill.selected && bill.select_number > 0) {
      if (bill.block_num > 0 || bill.wnum_danding > 0) {
        return true;
      }
    }
  }

  return false;
};

ShipBillD.prototype.getAllSelected = function() {
  var bills = [];
  this.allBills.forEach(function(bill) {
    if (bill.selected) { // && (bill.select_number > 0 || bill.prev_select_num > 0)) {
      var num = (bill.prev_select_num > 0) ? (bill.prev_select_num + bill.select_number) : bill.select_number;
      var weight = 0;

      var allVehSendNum = 0;
      bill.vehicles.forEach(function(bveh) { allVehSendNum += bveh.send_num });

      if (bill.block_num > 0) {
        if (allVehSendNum > 0) {
          num = allVehSendNum;
        }
      } else {
        weight = num;
        num = (bill.prev_wnum_danding > 0) ? (bill.prev_wnum_danding + bill.wnum_danding) : bill.wnum_danding;
        if (allVehSendNum > 0) {
          num = allVehSendNum;
        }
      }

      if (num > 0 || weight > 0) {
        bills.push({
          bill_id: bill._id,
          num: num,
          weight: weight,
          vehicles: bill.vehicles.slice(0)
        })
      }
    }
  });

  return bills;
};

ShipBillD.prototype.clearVehicle = function(wid) {
  this.allBills.forEach(function (bill) {
    if (bill.selected && bill.inner_waybill_no) {
      var wno = bill.inner_waybill_no.substring(0, 17);
      if (wno === wid) {
        bill.vehicles = [];
        bill.inner_waybill_no = "";
      }
    }
  })
};

ShipBillD.prototype.vehicleComplete = function(iwno, vname, vfrom) {
  this.allBills.forEach(function (bill) {
    if (bill.selected && bill.inner_waybill_no === iwno && bill.select_number > 0) {
      var num = 0, weight = 0;
      if (bill.block_num > 0) {
        num    = bill.select_number;
        weight = toFixedNumber(bill.select_number * bill.weight, 3);
      } else {
        num    = bill.wnum_danding;
        weight = toFixedNumber(bill.select_number, 3);
      }

      bill.vehicles.push({
        inner_waybill_no: iwno,
        veh_name:         vname,
        veh_ship_from:    vfrom,
        send_num:         num,
        send_weight:      weight
      });

      if (typeof bill.prev_select_num === 'undefined') {
        bill.prev_select_num = bill.select_number;
      } else {
        bill.prev_select_num += bill.select_number;
      }

      if (typeof bill.prev_wnum_danding === 'undefined') {
        bill.prev_wnum_danding = bill.wnum_danding > 0 ? bill.wnum_danding : 0;
      } else {
        bill.prev_wnum_danding += bill.wnum_danding > 0 ? bill.wnum_danding : 0;
      }

      bill.select_number = 0;
      bill.wnum_danding  = 0;
      bill.left = bill.left_num;
      bill.inner_waybill_no = ''; // clear it for new inner waybill created
    }
  })
};

var waybillHandler = {
  billsInfo: [],
  queryWaybillData: {},
  shipName: '',
  openToNew: false,

  init: function(name) { this.shipName = name },

  setName: function(name) { this.shipName = name },

  reset: function(name) {
    this.billsInfo = [];
    this.shipName = name;
    this.openToNew = false;
  },
  resetWithQueryData: function(qData, selectedIdx) {
    var selected = null;
    
    this.billsInfo        = [];
    this.openToNew        = false;
    this.queryWaybillData = qData;
    if (selectedIdx >= 0 && selectedIdx < qData.invoices.length) {
      selected = qData.invoices[selectedIdx];
      this.shipName = selected.ship_name;
    }
    
    return selected;    
  },

  save: function() { this.billsInfo.forEach(function(item) { item.save() }) },

  saveInvoice: function(data) {
    if (!$.isEmptyObject(this.queryWaybillData) && typeof(this.queryWaybillData.invoices) !== 'undefined') {
      for (var i = 0, len = this.queryWaybillData.invoices.length; i < len; ++i) {
        if (this.queryWaybillData.invoices[i].waybill_no === data.waybill_no) {
          this.queryWaybillData.invoices[i].vehicle_vessel_name = data.vehicle_vessel_name;
          this.queryWaybillData.invoices[i].ship_name           = data.ship_name;
          this.queryWaybillData.invoices[i].ship_customer       = data.ship_customer;
          this.queryWaybillData.invoices[i].ship_from           = data.ship_from;
          this.queryWaybillData.invoices[i].ship_to             = data.ship_to;
          this.queryWaybillData.invoices[i].ship_date           = data.ship_date;
          this.queryWaybillData.invoices[i].bills               = data.bills;
          this.queryWaybillData.invoices[i].total_weight        = data.total_weight;
          this.queryWaybillData.invoices[i].username            = data.username;
          this.queryWaybillData.invoices[i].shipper             = data.shipper;
          this.queryWaybillData.invoices[i].state               = data.state;
          break;
        }
      }
    }
    this.billsInfo.forEach(function(item) { item.saveToContinue() });
  },

  addBill: function(bill) {
    var result = this.findCreate(bill.order_no, true);
    if (!result.found || !result.data.find(bill).found) {
      result.data.add(bill);
    }
  },

  addBillAndTableRow: function(bill, num, insert) {
    var result = this.findCreate(bill.order_no, true);
    var res = result.data.find(bill);
    if (result.found && res.found) {
      result.data.selectedWithWaybillNum(res.index, this.openToNew, num);
      res.bill.vehicles          = bill.vehicles.slice(0);
      res.bill.wnum_danding      = bill.wnum_danding;
      res.bill.prev_wnum_danding = bill.prev_wnum_danding;
      insert(res.bill, result.data.getTip(this.shipName));
    } else {
      bill.openToNew = this.openToNew;
      bill.selected  = true;

      if (this.openToNew) {
        bill.prev_select_num = num;
        bill.select_number   = 0;
      } else {
        bill.select_number = num;
      }

      if (bill.left_num >= 0 && !this.openToNew) {
        bill.left = bill.left_num + (+num);
        this.left_num += bill.left;
      }

      setTip(bill, num);
      result.data.allBills.push(bill);
      insert(bill, result.data.getTip(this.shipName));
    }
  },

  addBillAndTableRow_1: function(bill, num) {
    var result = this.findCreate(bill.order_no, true);
    var res = result.data.find(bill);
    if (result.found && res.found) {
      if (num > 0) {
        res.bill.selected        = true;
        res.bill.prev_select_num = num;
        res.bill.select_number   = 0;
        res.bill.vehicles          = bill.vehicles.slice(0);
        res.bill.wnum_danding      = bill.wnum_danding;
        res.bill.prev_wnum_danding = bill.prev_wnum_danding;
        setTip(res.bill, num);
      }

      return {updatedBill: res.bill, tips: result.data.getTip(this.shipName) };
    } else {
      bill.openToNew = this.openToNew;
      bill.selected  = true;
      if (this.openToNew) {
        bill.prev_select_num = num;
        bill.select_number   = 0;
      } else {
        bill.select_number = num;
      }

      if (bill.left_num >= 0 && !this.openToNew) {
        bill.left = bill.left_num + (+num);
        this.left_num += bill.left;
      }
      setTip(bill, num);
      result.data.allBills.push(bill);
      return {updatedBill: bill, tips: result.data.getTip(this.shipName) };
    }
  },

  addAndInsertTable: function(orderNo, billNo, innerWNo) {
    var result = this.findCreate(orderNo, false);
    if (result.found) {
      return {
        bills:    result.data.selected(billNo, innerWNo),
        tip:      result.data.getTip(this.shipName),
        billtips: result.data.getBillTips(this.shipName, billNo)
      }
    } else {
      return null;
    }
  },

  addAndInsertTable_1: function(sOrder, sBill, innerWNO, insert) {
    var orderNo = sOrder.val();
    var result = this.findCreate(orderNo, false);
    if (!result.found) {
      return false;
    }
    var billNo = sBill.val();
    var selectedBills = result.data.selected(billNo, innerWNO);
    if (selectedBills.length > 0) {
      insert(selectedBills);
      sOrder.find(':selected').prop("title", result.data.getTip(this.shipName));
      var billTip = result.data.getBillTips(this.shipName, billNo);
      var search = 'option[value="{0}"]'.format(billNo);
      var option = sBill.find(search);
      option.prop("title", billTip.tip);
      option.prop("disabled", billTip.left_num == 0);
    }
    return selectedBills.length > 0;
  },

  deleteTableRow: function(b, isVesselForUpdate, nwData, updateUI) {
    var result = this.findCreate(b.order_no, false);
    if (result.found) {
      if (typeof b.prev_select_num === 'undefined') {
        b.prev_select_num = 0;
      }

      if (isVesselForUpdate) {
        if (b.block_num > 0) {
          b.select_number      -= nwData.num;
          b.left_num           += nwData.num;
          result.data.left_num += nwData.num;
        } else {
          b.select_number      -= nwData.weight;
          b.wnum_danding       -= nwData.num;
          b.left_num           += nwData.weight;
          result.data.left_num += nwData.weight;
        }

        setTip(b, (b.select_number + b.prev_select_num > 0) ? (b.select_number + b.prev_select_num > 0) : 0);

      } else {
        b.select_number = 0;
        if (b.left >= 0) {
          b.left_num = b.left;
          result.data.left_num += b.left;
        } else {
          b.left_num = 0;
        }

        setTip(b, (b.prev_select_num > 0) ? b.prev_select_num : 0);
      }

      updateUI(result.data.getBillTips(this.shipName, b.bill_no), result.data.getTip(this.shipName));
    }
  },

  updateShipNum: function(b, delta, updateUI) {
    var result = this.findCreate(b.order_no, false);
    if (result.found) {
      if (b.left_num >= 0) {
        b.left_num           -= delta;
        b.select_number      += delta;
        result.data.left_num -= delta;
        if (b.block_num === 0) {
          if (Math.abs(b.left_num) < 0.00001) {
            b.left_num = 0;
          }
          if (Math.abs(b.select_number) < 0.00001) {
            b.select_number = 0;
          }
        }

        setTip(b, (b.prev_select_num > 0 || b.openToNew) ? b.select_number + b.prev_select_num : b.select_number);
      }

      updateUI(result.data.getBillTips(this.shipName, b.bill_no), result.data.getTip(this.shipName));
    }
  },

  findCreate: function(no, created) {
    var result = { found: false };
    for (var i = 0; i < this.billsInfo.length; ++i) {
      if (this.billsInfo[i].no === no) {
        result.found = true;
        result.data  = this.billsInfo[i];
        break;
      }
    }

    if (!result.found && created) {
      this.billsInfo.push(new ShipBillD(no));
      result.data = this.billsInfo[this.billsInfo.length - 1];
    }

    return result;
  },

  getBill: function(tr) {
    var bno   = getTableCellChildren(tr, 1).text();
    var order = getTableCellChildren(tr, 2).text();
    var res = order.split('-');
    for (var i = 0; i < this.billsInfo.length; ++i) {
      if (this.billsInfo[i].no === res[0]) {
        var b =  this.billsInfo[i].findOne(bno, order);
        if (b) return b;
      }
    }
    return null;
  },

  handleVehicleComplete: function(innerWNo, vehName, vehShipFrom) {
    this.billsInfo.forEach(function(item) { item.vehicleComplete(innerWNo, vehName, vehShipFrom) });
  },

  clearVehicles: function(wid) { this.billsInfo.forEach(function (item) { item.clearVehicle(wid) }) },

  hasSelectedBills: function() {
    for (var i = 0; i < this.billsInfo.length; ++i) {
      if (this.billsInfo[i].hasSelected()) { return true }
    }

    return false;
  },

  getSelectedBills: function() {
    var selectedBills = [];
    this.billsInfo.forEach(function(item) {
      Array.prototype.push.apply(selectedBills, item.getAllSelected());
    });

    return selectedBills;
  },

  showSelectedBill: function (wid, show, afterShow) {
    var found = false;
    this.billsInfo.forEach(function (item) {
      item.allBills.forEach(function (bill) {
        if (bill.selected) {// && (bill.select_number > 0 || bill.prev_select_num > 0)) {
          var danding = (bill.prev_wnum_danding > 0) ? bill.prev_wnum_danding + bill.wnum_danding : bill.wnum_danding;
          var num = (bill.prev_select_num > 0) ? bill.prev_select_num + bill.select_number : bill.select_number;
          if (bill.block_num > 0) {
            if (num > 0) {
              show(bill, bill.block_num, num, num * bill.weight);
              bill.inner_waybill_no = wid;
              bill.prev_select_num = 0;
              bill.select_number = num;
              found = true;
            }
          } else {
            if (num > 0 && danding > 0) {
              show(bill, bill.total_weight, danding, num);
              bill.inner_waybill_no = wid;
              bill.prev_wnum_danding = 0;
              bill.wnum_danding = danding;
              bill.prev_select_num = 0;
              bill.select_number = num;
              found = true;
            }
          }
        }
      })
    });

    if (found) { afterShow() }
  },

  hasMixedBill: function() { // 有单定和定尺结合的提单
    var result = 0;
    for (var i = 0; i < this.billsInfo.length; ++i) {
      var item = this.billsInfo[i];
      for (var k = 0; k < item.allBills.length; ++k) {
        var bill = item.allBills[k];
        if (bill.selected) {
          if (bill.block_num > 0) {
            result = (result === 2) ? 3 : 1;
          } else if (result === 1) {
            result = 3; // 混合
          } else {
            result = 2; // 单定 - 只有重量
          }
        }

        if (result === 3) {
          return 3;
        }
      }
    }

    return result;
  },

  compare: function(invoice) {
    var count = 0;
    for (var idx0 = 0; idx0 < this.billsInfo.length; ++idx0) {
      var item = this.billsInfo[idx0];
      for (var idx1 = 0; idx1 < item.allBills.length; ++idx1) {
        var bill = item.allBills[idx1];
        if (bill.selected) {
          ++count;
          var found = false;
          for (var i = 0; i < invoice.bills.length; ++i) {
            var b = invoice.bills[i];
            if (String(bill._id) === String(b.bill_id)) {
              found = bill.block_num > 0 ? bill.select_number == b.num : (bill.select_number == b.weight && bill.wnum_danding == b.num);
              break;
            }
          }
          if (!found) {
            return false; // 找不到相同的id, 则返回false表示不相同
          }
        }
      }
    }
    // 所有的id都能找到, 但是如果数量不一样,则同样不相同
    return (count == invoice.bills.length);
  },

  insertSelectOptions: function(element, name) {
    element.empty();
    if (!name) {
      name = this.shipName;
    }
    var allDisabled = [];
    var items = [];
    this.billsInfo.forEach(function(item) {
      for (var i = 0; i < item.allBills.length; ++i) {
        if (name === item.allBills[i].billing_name) {
          if (item.left_num > 0) {
            items.push(item);
          } else {
            allDisabled.push(item.getOptionWithTip(name));
          }
          break;
        }
      }
    });

    items.sort(function(a, b) { return (a.no > b.no) ? 1 : (a.no < b.no ? -1 : 0) });
    items.forEach(function(item) { element.append(item.getOptionWithTip(name)) });
    allDisabled.forEach(function(opt) { element.append(opt) });
    unselected(element);
  },

  setQueryData: function(data) { this.queryWaybillData = data; },

  getWaybill: function(wno) {
    var invs = this.queryWaybillData.invoices;
    for (var i = 0; i < invs.length; ++i) {
      if (wno == invs[i].waybill_no) {
        return invs[i];
      }
    }
    return null;
  },

  getBillsFromInvoice: function(waybill) {
    var bills = [];
    var len = waybill.bills.length;

    this.queryWaybillData.bills.forEach(function(bill) {
      for (var i = 0; i < len; ++i) {
        if (String(waybill.bills[i].bill_id) === String(bill._id)) {
          if (bill.block_num > 0) {
            bill.wnum = waybill.bills[i].num;
          } else {
            bill.wnum = waybill.bills[i].weight;
            bill.prev_wnum_danding = 0; // waybill.bills[i].num
            bill.wnum_danding = waybill.bills[i].num;
          }

          bill.vehicles = waybill.bills[i].vehicles.slice(0);
          bills.push(bill);
          break;
        }
      }
    });

    return bills;
  }
};

function sortObject(obj) {
  return Object.keys(obj).sort().reduce(function (result, key) {
    result[key] = obj[key];
    return result;
  }, {});
}

function sameBill(a, b) {
  return b.order_no === a.order_no && b.order_item_no === a.order_item_no && b.bill_no === a.bill_no;
}

function setTip(bill, select_num) {
  if (bill.block_num > 0) {
    bill.tip = '订单项次号:{0}, 提单号:{1}, 实际块数:{2}, 可用块数:{3}, 当前运单已用块数:{4}'.format(bill.order_item_no, bill.bill_no, bill.block_num, bill.left_num, select_num);
  } else {
    bill.tip = '订单项次号:{0}, 提单号:{1}, 实际重量:{2}, 剩余重量:{3}, 当前运单已用重量:{4}'.format(bill.order_item_no, bill.bill_no, getStrValue(bill.total_weight), getStrValue(bill.left_num), getStrValue(select_num));
  }
}

function getMaxInnerWaybillNo(bills, waybill_no) {
  var maxId = 0;
  bills.forEach(function (bill) {
    bill.invoices.forEach(function (inv) {
      if (inv.inv_no === waybill_no) {
        inv.vehicles.forEach(function (veh) {
          maxId = Math.max(maxId, parseInt(veh.inner_waybill_no.substring(17)));
        })
      }
    })
  });
  return ++maxId;
}

function inputEventRegister(el, func) {
  if (el.length > 0) {
    el.on('focus', function () {
      $(this).one('mouseup', function () {
        $(this).select();
        return false;
      }).select();
      $(this).data("old", this.value || "");
    });
    el.on('keyup paste', function (e) {
      e.stopImmediatePropagation();
      func($(this));
    });
    el.ForceNumericOnly();
  }
}