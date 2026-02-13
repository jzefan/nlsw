/**
 * Created by ezefjia on 12/4/2014.
 */

$(function () {
  "use strict";

  var tableBody = $('#table-tbody');
  var btnFilter = $('#filter');
  var btnExport = $('#search-export');
  var singlePriceInput = $('#single-price-input');
  var batchPriceInput = $('#batch-price-input');
  var btnSettle = $('#settle-bill');
  var btnSettleCancel = $('#settle-bill-cancel');
  var btnPay = $('#settle-pay');
  var btnPayCancel = $('#settle-pay-cancel');
  var btnShowDetail = $('#show-detail');
  var btnPrintDetail = $('#settle-print-detail');
  var btnUnshipDelay = $('#delay-info');
  var ckReceiptIcon = $('#receipt-icon');
  var printBody = $('#print-detail-tbody');
  var totalAmount = 0;
  var totalWeight = 0;
  var selectedTotalWeight = 0;
  var selectedTotalAmount = 0;
  var prePayment = 0;
  var allReceiptOk = true;

  var iChargeCash = $('#charge-cash');
  var iChargeOil = $('#charge-oil');
  var unpayBlock = $('#unpay-block');
  //var sAdvanceMode  = $('#advance_mode');
  //var iAdvanceNum   = $('#advance_num');
  var unshipDate = $('#unship-date-grp');
  var iDelayDay = $('#delay-day');
  var checkReceipt = $('#sdd_receipt');
  var receiptRemark = $('#delay-remark');
  var dayChanged = false;
  var receiptChecked = false;

  // var localUser = local_user;
  var dbRecords = [];
  var curr_records = []; // 存放查询得到的所有记录
  var selected_records = [];
  var selectedInnerNo = [];
  var allInvVehicles = [];

  let uploadImageWno = null;

  $('#selected-summary').hide()

  $('#first-th').html('<input id="select-all" type="checkbox" data-toggle="tooltip" title="选择所有记录" />&nbsp;<label id="all-not-need" class="fa fa-star-o" data-toggle="tooltip" title="点击可设置不需要结算和需要结算" style="cursor:pointer; color:red; font-size:18px;" ></label>');

  var qFilter = new QueryFilterD(local_data);
  qFilter.eventHandler(filterData);

  // 发货单位筛选
  var shipFilterSelected = []; // 存放被选中的发货单位名称（空字符串代表空）

  function buildBillNameFilterPanel() {
    var panel = $('#bill-name-filter-panel');
    var list = panel.find('.bill-filter-list').empty();
    var map = {};

    // 从当前记录中收集唯一的发货单位
    curr_records.forEach(function(inv) {
      var val = inv.ship_customer ? inv.ship_customer : '';
      if (!map.hasOwnProperty(val)) {
        map[val] = true;
        var label = val === '' ? '（空）' : val;
        var checked = shipFilterSelected.length ? (shipFilterSelected.indexOf(val) >= 0) : true;
        var item = $('<div class="filter-item-row" />');
        var chk = $('<input type="checkbox" class="bill-filter-item">').attr('data-value', val).prop('checked', checked);
        item.append($('<label style="color: #1a1a1a;"/>').append(chk).append(' ' + label));
        list.append(item);
      }
    });

    // 全选控制
    // $('#bill-filter-select-all').prop('checked', list.find('.bill-filter-item').length === list.find('.bill-filter-item:checked').length);
    // $('#bill-filter-select-all').off('change').on('change', function() { list.find('.bill-filter-item').prop('checked', $(this).is(':checked')); });

    // 申请与清除按钮由外部绑定
  }

  function applyBillNameFilter() {
    shipFilterSelected = [];
    $('#bill-name-filter-panel .bill-filter-item:checked').each(function() { shipFilterSelected.push($(this).attr('data-value')); });
    if (shipFilterSelected.length) {
      $('#bill-name-filter-icon').css('color', '#337ab7');
    } else {
      $('#bill-name-filter-icon').css('color', 'gray');
    }
    resetTableRow();
  }

  function clearBillNameFilter() {
    shipFilterSelected = [];
    $('#bill-name-filter-icon').css('color', 'gray');
    resetTableRow();
  }

  // 打开面板并初始化列表
  $('#bill-name-filter-icon').on('click', function(e) {
    e.stopPropagation();
    buildBillNameFilterPanel();
    var panel = $('#bill-name-filter-panel');
    // 位置对齐到图标右下方
    var offset = $(this).position();
    panel.css({ left: offset.left - 10 + 'px', top: (offset.top + 24) + 'px' });
    panel.toggle();
  });

  // 文档点击隐藏面板
  $(document).on('click', function(e) {
    if (!$(e.target).closest('#bill-name-filter-panel, #bill-name-filter-icon').length) {
      $('#bill-name-filter-panel').hide();
    }
  });

  // 面板内按钮
  $(document).on('click', '#bill-filter-apply', function(e) { e.stopPropagation(); applyBillNameFilter(); $('#bill-name-filter-panel').hide(); });
  $(document).on('click', '#bill-filter-clear', function(e) { e.stopPropagation(); clearBillNameFilter(); $('#bill-name-filter-panel').hide(); });

  showHtmlElement(btnSettle, true);
  showHtmlElement(btnSettleCancel, false);
  showHtmlElement(btnPay, false);
  showHtmlElement(btnPayCancel, false);
  showHtmlElement(btnPrintDetail, false);
  showHtmlElement(unpayBlock, false);
  enableButtons();

  let carrierBoss = ''
  function filterData(needUpdateDbData, emptyDbData) {
    if (qFilter.settledState === '未结算') {
      showHtmlElement(btnSettle, true);
      showHtmlElement(btnSettleCancel, false);
      showHtmlElement(btnPay, false);
      showHtmlElement(btnPayCancel, false);
      showHtmlElement(btnPrintDetail, false);
      showHtmlElement(unpayBlock, false);
    } else if (qFilter.settledState === '已结算') {
      showHtmlElement(btnSettle, false);
      showHtmlElement(btnSettleCancel, true);
      showHtmlElement(btnPay, true);
      showHtmlElement(btnPrintDetail, true);
      showHtmlElement(btnPayCancel, false);
      showHtmlElement(unpayBlock, true);
    } else if (qFilter.settledState === '已付款') {
      showHtmlElement(btnSettle, false);
      showHtmlElement(btnSettleCancel, false);
      showHtmlElement(btnPay, false);
      showHtmlElement(btnPayCancel, true);
      showHtmlElement(btnPrintDetail, false);
      showHtmlElement(unpayBlock, false);
    } else if (qFilter.settledState === '不需要结算') {
      showHtmlElement(btnSettle, false);
      showHtmlElement(btnSettleCancel, false);
      showHtmlElement(btnPay, false);
      showHtmlElement(btnPayCancel, false);
      showHtmlElement(btnPrintDetail, false);
      showHtmlElement(unpayBlock, false);
    }

    if (needUpdateDbData) {
      var obj = qFilter.getQueryParams();
      nlApp.setTitle('查询数据, 请稍等...');
      nlApp.showPleaseWait();
      $.get('/get_invoice_settle_vellel', obj, function (data) {
        carrierBoss = obj.fContact // 把这个值保存起来
        dbRecords = [];
        if (data.ok) {
          dbRecords = sortByKey(data.invs, "ship_date", "DSC")
        }
        curr_records = dbRecords;//qFilter.updateOptions(dbRecords, false);
        resetTableRow();
        nlApp.hidePleaseWait();
      });
    } else {
      if (emptyDbData) {
        dbRecords = [];
      }
      curr_records = dbRecords; //qFilter.updateOptions(dbRecords, emptyDbData);
      resetTableRow();
    }
  }

  elementEventRegister($('#settle-search'), 'click', function () {
    filterData(true, false);
  });

  elementEventRegister(singlePriceInput, 'click', function () {
    if (selected_records.length === 1) {
      buildPriceDialog(selected_records[0], true);
    } else {
      var inv = getInvoiceByInnerNo(selectedInnerNo[0]);
      buildPriceDialog(inv, false, selectedInnerNo[0]);
    }
  });

  elementEventRegister(batchPriceInput, 'click', buildPriceBatchInputDialog);

  elementEventRegister($('#select-all'), 'click', function () {
    var checked = $(this).is(":checked");
    if (curr_records.length) {
      selected_records = [];
      selectedInnerNo = [];

      if (checked) {
        var numOfRow = tableBody.find("tr").length;
        for (var i = 0; i < numOfRow; ++i) {
          var tr = getRowChildren(tableBody, i);
          var wno = getTableCellChildren(tr, 2).text();
          if (wno.length > 17) {
            selectedInnerNo.push(wno);
          } else {
            for (var k = 0; k < curr_records.length; ++k) {
              if (wno === curr_records[k].waybill_no) {
                selected_records.push(curr_records[k]);
                break;
              }
            }
          }
        }

        $('.tr_header').addClass('invoice-highlighted');
      } else {
        $('.tr_header').removeClass('invoice-highlighted');
      }

      $('.select-inv').prop("checked", checked);
      $('.select-sub-inv').prop("checked", checked);
      enableButtons();
    }
  });

  $('#all-not-need').on('click', function () {
    if (curr_records.length) {
      if (qFilter.settledState === '未结算') {
        var me = $(this);
        var wnoList = [];
        var numOfRow = tableBody.find("tr").length;
        for (var i = 0; i < numOfRow; ++i) {
          var tr = getRowChildren(tableBody, i);
          wnoList.push(getTableCellChildren(tr, 2).text());
        }
        bootbox.confirm("您确定要批量不结算操作", function (result) {
          if (result) {
            switchNotNeedSettle(me, wnoList);
          }
        })
      } else {
        bootbox.alert("在已结算状态下不能进行此操作");
      }
    }
  });

  elementEventRegister(btnSettle, 'click', function () { settleVessel(true, '已结算', new Date(), local_user.userid); });
  elementEventRegister(btnSettleCancel, 'click', function () { settleVessel(false, '未结算', '', '') });
  elementEventRegister(btnPay, 'click', function () { settleVesselPay(true, '已付款', new Date()); });
  elementEventRegister(btnPayCancel, 'click', function () { settleVesselPay(false, '已结算', '') });

  function uploadFile(e, preview, uploadHint, wno, inv = null) {
    // 获取选择的文件
    var file = e.target.files[0];

    if (file) {
      const maxSizeInBytes = 8 * 1024 * 1024; // 8 MB
      if (file.size > maxSizeInBytes) {
        bootbox.alert('文件大小超过8M，请选择更小的文件或把图片压缩一下再上传!');
        return;
      }

      // 读取文件并显示预览图
      var reader = new FileReader();
      reader.onload = function (e) {
        preview.attr('src', e.target.result).show();
        uploadHint.hide();
      };
      reader.readAsDataURL(file);

      // 上传到服务器后端
      const formData = new FormData();
      formData.append('image', file);
      formData.append('inv_no', wno)
      nlApp.setTitle('正在上传回执图片, 请稍等...');
      nlApp.showPleaseWait();
      try {
        $.ajax({
          url: '/upload-receipt-img',
          method: 'POST',
          data: formData,
          contentType: false,
          processData: false,
          success: function (response) {
            if (inv) {
              inv.receipt = 1;
              checkReceipt.iCheck('check');
            }
            nlApp.hidePleaseWait();
          },
          error: function (error) {
            bootbox.alert('上传图片出错，可能后端服务出错，请联系管理员！')
            nlApp.hidePleaseWait();
          }
        });
      } catch (e) {
        // 
      } finally {
        nlApp.hidePleaseWait();
      }
    } else {
      console.log('No file selected.');
    }
  }

  $('#receipt-file').on('change', async function (e) {
    var inv = (selected_records.length === 1) ? selected_records[0] : getInvoiceByInnerNo(selectedInnerNo[0]);
    const wno = selected_records.length === 1 ? inv.waybill_no : selectInnerNo[0]
    // if (selected_records.length === 1) {
    //   formData.append('inv_no', inv.waybill_no)
    // } else {
    //   formData.append('inv_no', selectedInnerNo[0])
    // }
    uploadFile(e, $('#previewImage'), $('#upload-hint'), wno, inv)
  });

  $('#upload-receipt-file').on('change', async function (e) {
    if (uploadImageWno) {
      // let inv = getInvoiceByInnerNo(uploadImageWno)
      uploadFile(e, $('#preview-receipt-image'), $('#upload-receipt-hint'), uploadImageWno)
    }
  });

  function settleVessel(settle, state, date, username) {
    if (selected_records.length || selectedInnerNo.length) {
      var allSelectedWNo = [];
      for (var i = 0, len = selected_records.length; i < len; ++i) {
        var rec = selected_records[i];
        if (settle) {
          if (rec.vessel_price < 0) {
            bootbox.alert('您选择的运单: ' + rec.waybill_no + ' 已设置为不需要结算, 请先取消不结算,再来结算');
            return;
          }
          else if (rec.vessel_price === 0) {
            bootbox.alert('您选择的运单: ' + rec.waybill_no + ' 还未输入价格, 不能继续结算');
            return;
          }
          // else if (rec.receipt != 1) {
          //   bootbox.alert('您选择的运单: ' + rec.waybill_no + ' 还未收到回执, 不能继续结算');
          //   return;
          // }
          else if (rec.vessel_settle_state === '未结算') {
            allSelectedWNo.push(rec.waybill_no);
          }
        }
        else {
          if (rec.vessel_price < 0) {
            bootbox.alert('您选择的运单: ' + rec.waybill_no + ' 已设置为不需要结算, 不能取消');
            return;
          }
          else if (rec.vessel_settle_state === '已结算') {
            allSelectedWNo.push(rec.waybill_no);
          }
        }
      }

      var wnoListFromInner = [];
      var selectedInvFromInner = [];
      for (var k = 0, klen = selectedInnerNo.length; k < klen; ++k) {
        var innerNo = selectedInnerNo[k];
        var inv = getInvoiceByInnerNo(innerNo);
        if (inv) {
          var vehObj = getVehiclesInfo(inv, false);
          if (settle) {
            // if (vehObj[innerNo].receipt != 1) {
            //   bootbox.alert('您选择的内部运单: ' + innerNo + ' 还未收到回执, 不能继续结算');
            //   return;
            // }
            // else {
            if (vehObj[innerNo].price < 0) {
              bootbox.alert('您选择的内部运单: ' + innerNo + ' 已设置为不需要结算, 请先取消不结算,再来结算');
              return;
            }
            else if (vehObj[innerNo].price === 0) {
              bootbox.alert('您选择的内部运单: ' + innerNo + ' 还未输入价格, 不能继续结算');
              return;
            }
          }
        }
        else {
          if (vehObj[innerNo].price < 0) {
            bootbox.alert('您选择的内部运单: ' + innerNo + ' 已设置为不需要结算, 不能取消结算');
            return;
          }
        }

        if (wnoListFromInner.indexOf(inv.waybill_no) < 0) {
          wnoListFromInner.push(inv.waybill_no);
        }

        selectedInvFromInner.push(inv);
      }

      ajaxRequestHandle('/settle_vessel', 'POST',
        { allSelectedInvNo: allSelectedWNo, allInvNoFromInner: wnoListFromInner, allInnerNo: selectedInnerNo, settle: settle }, '车船结算', function () {

          selected_records.forEach(function (inv) {
            if (allSelectedWNo.indexOf(inv.waybill_no) >= 0) {
              inv.vessel_settle_state = state;
              inv.vessel_settle_date = date;
              inv.vessel_settler = username;
            }
          });

          selectedInvFromInner.forEach(function (inv) {
            inv.inner_settle.forEach(function (iis) {
              if (selectedInnerNo.indexOf(iis.inner_waybill_no) >= 0) {
                iis.state = state;
                iis.date = date;
              }
            });

            var vo = getVehiclesInfo(inv, false);
            for (var key in vo) {
              if (vo.hasOwnProperty(key) && selectedInnerNo.indexOf(key) >= 0) {
                vo[key].state = state;
                vo[key].date = date;
              }
            }
          });

          resetTableRow();
        });
    } else {
      bootbox.alert("请先选择您要结算或结算取消的行");
    }
  }

  function settleVesselPay(pay, state, date) {
    if (selected_records.length || selectedInnerNo.length) {
      var allPayWNo = [];
      for (var i = 0, len = selected_records.length; i < len; ++i) {
        var rec = selected_records[i];
        allPayWNo.push(rec.waybill_no);
      }

      var wnoListFromInner = [];
      var selectedInvFromInner = [];
      for (var k = 0, klen = selectedInnerNo.length; k < klen; ++k) {
        var innerNo = selectedInnerNo[k];
        var inv = getInvoiceByInnerNo(innerNo);
        if (inv) {
          if (wnoListFromInner.indexOf(inv.waybill_no) < 0) {
            wnoListFromInner.push(inv.waybill_no);
          }

          selectedInvFromInner.push(inv);
        }
      }

      ajaxRequestHandle('/settle_vessel_pay', 'POST',
        { allPayInvNo: allPayWNo, allInvNoFromInner: wnoListFromInner, allInnerNo: selectedInnerNo, forPay: pay }, '车船结算付款', function () {

          selected_records.forEach(function (inv) {
            if (allPayWNo.indexOf(inv.waybill_no) >= 0) {
              inv.vessel_settle_state = state;
              inv.pay_date = date;
            }
          });

          selectedInvFromInner.forEach(function (inv) {
            inv.inner_settle.forEach(function (iis) {
              if (selectedInnerNo.indexOf(iis.inner_waybill_no) >= 0) {
                iis.state = state;
                iis.pay_date = date;
              }
            });

            var vo = getVehiclesInfo(inv, false);
            for (var key in vo) {
              if (vo.hasOwnProperty(key) && selectedInnerNo.indexOf(key) >= 0) {
                vo[key].state = state;
                vo[key].pay_date = date;
              }
            }
          });

          resetTableRow();
        });
    }
  }

  elementEventRegister(btnShowDetail, 'click', function () {
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
          for (var i = 0; i < inv.bills.length; ++i) {
            var ib = inv.bills[i];
            if (String(b._id) === String(ib.bill_id)) {
              html += buildTableTr(b, ib.num, ib.weight);
              if (ib.vehicles.length) {
                var str = "";
                ib.vehicles.forEach(function (veh) {
                  str = "{0}, <code>{1}</code><code>{2}</code><br />".format(veh.veh_name, veh.send_num, getStrValue(veh.send_weight));
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
        $('#settle-detail-dialog').modal({ backdrop: 'static', keyboard: false }).modal('show');
      });
    }
  });

  function buildTableTr(bill, send_num, send_weight) {
    var str = '<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td>';
    if (bill.block_num > 0) {
      return str.format(bill.bill_no, getOrder(bill.order_no, bill.order_item_no), bill.ship_warehouse ? bill.ship_warehouse : "",
        getStrValue(bill.thickness), getStrValue(bill.width), getStrValue(bill.len),
        getStrValue(bill.weight), bill.block_num, getStrValue(bill.total_weight), send_num, getStrValue(bill.weight * send_num))
    } else {
      return str.format(bill.bill_no, getOrder(bill.order_no, bill.order_item_no), bill.ship_warehouse ? bill.ship_warehouse : "",
        getStrValue(bill.thickness), getStrValue(bill.width), getStrValue(bill.len),
        "", "", getStrValue(bill.total_weight), send_num, getStrValue(send_weight))
    }
  }

  btnPrintDetail.on('click', function () {
    if (selected_records.length || selectedInnerNo.length) {
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
      var payment = 0;
      var numOfRow = tableBody.find("tr").length;
      for (var i = 0; i < numOfRow; ++i) {
        var tr = getRowChildren(tableBody, i);
        var check = getTableCellChildren(tr, 0).find("input");
        if (check.is(":checked")) {
          var w = getTableCellChildren(tr, 11).text();
          var p = getTableCellChildren(tr, 8).text();
          // var w = getTableCellChildren(tr, 10).text();
          // var p = getTableCellChildren(tr, 7).text();
          printBody.append(trStr.format(getTableCellChildren(tr, 3).text(),
            // getTableCellChildren(tr, 4).text(),
            getTableCellChildren(tr, 5).text(),
            getTableCellChildren(tr, 6).text(),
            getTableCellChildren(tr, 7).text(),
            w, getTableCellChildren(tr, 9).text(), p,
            getTableCellChildren(tr, 12).text(),
            getTableCellChildren(tr, 15).text(),
            getTableCellChildren(tr, 16).text()));
          totWeight += (+w);
          totPrice += (+p);

          var tdText = getTableCellChildren(tr, 17).text();
          if (tdText != '无') {
            var tmp = tdText.split(':');
            if (tmp.length === 3) {
              payment += (+tmp[2]);
              var idx1 = tmp[1].split(',')[0];
              payment += (+idx1);
            } else if (tmp.length === 2) {
              payment += (+tmp[1]);
            }
          }
        }
      }

      $('#print-total-weight').text(getStrValue(totWeight));
      $('#print-total-number').text(getStrValue(totPrice));
      $('#print-unpay-number').text(getStrValue(totPrice - payment));
      $('#settle-print-dialog').modal({ backdrop: 'static', keyboard: false }).modal('show');
    } else {
      bootbox.alert('请选择你要打印的清单列表');
    }
  });

  $('#print-to').on('click', function () {
    printDiv($('#print-div'));
  });

  $('#print-and-pay').on('click', function () {
    if (printDiv($('#print-div'))) {
      settleVesselPay(true, '已付款', new Date());
    }
  });

  function printDiv(elem) {
    var w = window.open();
    if (!w) {
      bootbox.alert('请允许弹出窗口!');
      return false;
    } else {
      w.document.write(elem.html());
      w.print();
      w.close();
      return true;
    }
  }

  function getInvoiceByInnerNo(ino) {
    var inv = null;
    var wno = ino.substring(0, 17);
    for (var n = 0; n < curr_records.length; ++n) {
      if (wno === curr_records[n].waybill_no) {
        inv = curr_records[n];
        break;
      }
    }

    return inv;
  }

  unshipDate.datetimepicker(getDateTimePickerOptions()).on('dp.change', function () {
    if (!dayChanged) {
      var date = unshipDate.data("DateTimePicker").getDate();
      if (date) {
        var inv = (selected_records.length === 1) ? selected_records[0] : getInvoiceByInnerNo(selectedInnerNo[0]);
        if (inv) {
          var day = date.diff(inv.ship_date, 'days') - 7;
          if (day > 0) {
            iDelayDay.val(day);
          } else {
            iDelayDay.val('0');
          }
        }
      }
    } else {
      dayChanged = false;
    }
  });

  iDelayDay.on('keyup paste', function () {
    var day = parseInt(this.value);
    if (day > 0) {
      var inv = (selected_records.length === 1) ? selected_records[0] : getInvoiceByInnerNo(selectedInnerNo[0]);
      if (inv) {
        dayChanged = true;
        unshipDate.data("DateTimePicker").setDate(moment(inv.ship_date).add(day + 7, 'days'));
      }
    }
  });

  elementEventRegister(checkReceipt, 'ifChecked', function () {
    receiptChecked = true;
    $('#receipt-file').click(); //.trigger('change');
  });
  elementEventRegister(checkReceipt, 'ifUnchecked', function () { receiptChecked = false; });

  elementEventRegister(btnUnshipDelay, 'click', function () {
    var inv = (selected_records.length === 1) ? selected_records[0] : getInvoiceByInnerNo(selectedInnerNo[0]);
    if (selected_records.length === 1) {
      iChargeCash.val(inv.charge_cash);
      iChargeOil.val(inv.charge_oil);
      iDelayDay.val(inv.delay_day);
      unshipDate.data("DateTimePicker").setMinDate(moment(inv.ship_date));
      unshipDate.data("DateTimePicker").setDate(inv.unship_date ? moment(inv.unship_date) : null);
      checkReceipt.iCheck((inv.receipt === 1) ? 'check' : 'uncheck');
      receiptRemark.val(inv.remark ? inv.remark : '');
    }
    else {
      var innerNo = selectedInnerNo[0];
      var vehObj = getVehiclesInfo(inv, false);
      if (vehObj && vehObj[innerNo]) {
        var tmp = vehObj[innerNo];
        iChargeCash.val(tmp.charge_cash);
        iChargeOil.val(tmp.charge_oil);
        iDelayDay.val(tmp.delay_day);
        unshipDate.data("DateTimePicker").setMinDate(moment(inv.ship_date));
        unshipDate.data("DateTimePicker").setDate(tmp.unship_date ? moment(tmp.unship_date) : null);
        checkReceipt.iCheck((tmp.receipt === 1) ? 'check' : 'uncheck');
        receiptRemark.val(tmp.remark ? tmp.remark : '');
      }
    }

    showHtmlElement($('#delay_receipt'), true);
    $('#previewImage').attr('src', '').hide();
    $('#upload-hint').show();
    $('#settle-delay-dialog').modal({ backdrop: 'static', keyboard: false }).modal('show');
  });

  $('#batch-charge-ctrl').on('click', function () {
    if (hasPrivilegePrice()) {
      iChargeCash.val('0');
      iChargeOil.val('0');
      //sAdvanceMode.val('现金');
      //iAdvanceNum.val('0');
      showHtmlElement($('#delay_receipt'), false);
      $('#settle-delay-dialog').modal({ backdrop: 'static', keyboard: false }).modal('show');
    }
  });

  $('#batch-receipt-ctrl').on('click', function () {
    if (hasPrivilegePrice()) {
      bootbox.confirm('您确定要批量设置回执吗?', function (result) {
        if (result) {
          var allNo = [];
          var numOfRow = tableBody.find("tr").length;
          for (var i = 0; i < numOfRow; ++i) {
            var tr = getRowChildren(tableBody, i);
            allNo.push(getTableCellChildren(tr, 2).text());
          }

          var obj = { receipt: (allReceiptOk ? 0 : 1) }; // false -> true
          updateDelayData({ unshipData: obj, wnoList: allNo, partInd: 2 });
        }
      });
    }
  });

  $('#settle-delay-btn-ok').on('click', function () {
    var obj = {
      charge_cash: iChargeCash.val(),
      charge_oil: iChargeOil.val()
    };

    if ($('#delay_receipt').css('display') == 'none') {
      var allNo = [];
      var numOfRow = tableBody.find("tr").length;
      for (var i = 0; i < numOfRow; ++i) {
        var tr = getRowChildren(tableBody, i);
        allNo.push(getTableCellChildren(tr, 2).text());
      }

      updateDelayData({ unshipData: obj, wnoList: allNo, partInd: 1 });
    }
    else {
      obj.unship_date = unshipDate.data("DateTimePicker").getDate();
      obj.delay_day = iDelayDay.val();
      obj.receipt = (receiptChecked ? 1 : 0);
      obj.remark = receiptRemark.val();
      var wno = (selected_records.length === 1) ? selected_records[0].waybill_no : selectedInnerNo[0];

      updateDelayData({ unshipData: obj, wnoList: [wno], partInd: 0 });
    }
  });

  function updateDelayData(data) {
    var msg = 'no_message';
    if (data.partInd === 0) {
      msg = '车船结算滞留信息输入';
    }

    nlApp.setTitle('设置回执信息, 请稍等...');
    nlApp.showPleaseWait();
    ajaxRequestHandle('/settle_vessel_delay_info', 'POST', data, msg, function () {
      if (data.partInd === 0 || data.partInd === 1) {
        nlApp.hidePleaseWait();
        $('#settle-delay-dialog').modal('hide');
      }

      data.wnoList.forEach(function (wno) {
        var waybillNo = wno;
        if (wno.length > 17) {
          waybillNo = wno.substring(0, 17);
        }

        for (var i = 0; i < curr_records.length; ++i) {
          if (waybillNo === curr_records[i].waybill_no) {
            var inv = curr_records[i];
            if (wno.length > 17) {
              var vehObj = getVehiclesInfo(inv, false);
              if (vehObj && isExist(vehObj[wno])) {
                if (data.partInd === 0) {
                  vehObj[wno].unship_date = data.unshipData.unship_date;
                  vehObj[wno].delay_day = data.unshipData.delay_day;
                  vehObj[wno].charge_cash = data.unshipData.charge_cash;
                  vehObj[wno].charge_oil = data.unshipData.charge_oil;
                  vehObj[wno].receipt = data.unshipData.receipt;
                  vehObj[wno].remark = data.unshipData.remark;
                } else if (data.partInd === 1) {
                  vehObj[wno].charge_cash = data.unshipData.charge_cash;
                  vehObj[wno].charge_oil = data.unshipData.charge_oil;
                } else if (data.partInd === 2) {
                  vehObj[wno].receipt = data.unshipData.receipt;
                } else if (data.partInd === 3) {
                  vehObj[wno].remark = data.unshipData.remark;
                }
              }
            } else {
              if (data.partInd === 0) {
                inv.unship_date = data.unshipData.unship_date;
                inv.delay_day = data.unshipData.delay_day;
                inv.charge_cash = data.unshipData.charge_cash;
                inv.charge_oil = data.unshipData.charge_oil;
                inv.receipt = data.unshipData.receipt;
                inv.remark = data.unshipData.remark;
              } else if (data.partInd === 1) {
                inv.charge_cash = data.unshipData.charge_cash;
                inv.charge_oil = data.unshipData.charge_oil;
              } else if (data.partInd === 2) {
                inv.receipt = data.unshipData.receipt;
              } else if (data.partInd === 3) {
                inv.remark = data.unshipData.remark;
              }
            }
          }
        }
      });

      var numOfRow = tableBody.find("tr").length;
      if (data.partInd === 2) {
        allReceiptOk = !allReceiptOk;
        for (var i = 0; i < numOfRow; ++i) {
          getRowChildren(tableBody, i).find("td:last").find('input').prop('checked', allReceiptOk);
        }
        switchElementClass(ckReceiptIcon, 'fa-check-square-o', 'fa-square-o');
      } else {
        for (var k = 0; k < numOfRow; ++k) {
          var tr = getRowChildren(tableBody, k);
          if (data.partInd === 1) {
            if (data.unshipData.charge_cash > 0 && data.unshipData.charge_oil > 0) {
              tr.find("td").eq(15).text('现金:' + data.unshipData.charge_cash + ',油:' + data.unshipData.charge_oil);
            } else if (data.unshipData.charge_cash > 0) {
              tr.find("td").eq(15).text('现金:' + data.unshipData.charge_cash);
            } else if (data.unshipData.charge_oil > 0) {
              tr.find("td").eq(15).text('油:' + data.unshipData.charge_oil);
            } else {
              tr.find("td").eq(15).text('无');
            }
          } else if (data.partInd === 0) {
            var td_wno = getTableCellChildren(tr, 2).text();
            if (td_wno === data.wnoList[0]) {
              tr.find("td").eq(13).text(date2Str(data.unshipData.unship_date));
              tr.find("td").eq(14).text(data.unshipData.delay_day);
              if (data.unshipData.charge_cash > 0 && data.unshipData.charge_oil > 0) {
                tr.find("td").eq(15).text('现金:' + data.unshipData.charge_cash + ',油:' + data.unshipData.charge_oil);
              } else if (data.unshipData.charge_cash > 0) {
                tr.find("td").eq(15).text('现金:' + data.unshipData.charge_cash);
              } else if (data.unshipData.charge_oil > 0) {
                tr.find("td").eq(15).text('油:' + data.unshipData.charge_oil);
              } else {
                tr.find("td").eq(15).text('无');
              }

              var td = tr.find("td:last");
              var iElem = td.find('i');
              if (data.unshipData.remark) {
                iElem.show();
                iElem.prop("title", data.unshipData.remark);
              } else {
                iElem.hide();
              }
              if (data.unshipData.receipt === 1) {
                resetTableRow()
              }
              break;
            }
          }
        }
      }
      nlApp.hidePleaseWait();
    });
  }

  $('#upload-receipt-ok').on('click', function () {
    if (uploadImageWno) {
      nlApp.setTitle('正在上传回执单图片，请稍等...');
      nlApp.showPleaseWait();
      ajaxRequestHandle('/settle_upload_receipt', 'POST', { wno: uploadImageWno }, 'no_message', function () {
        let isInner = uploadImageWno.length > 17
        let waybillNo = isInner ? uploadImageWno.substring(0, 17) : uploadImageWno;

        for (var i = 0; i < curr_records.length; ++i) {
          if (waybillNo === curr_records[i].waybill_no) {
            var inv = curr_records[i];
            if (isInner) {
              var vehObj = getVehiclesInfo(inv, false);
              if (vehObj && isExist(vehObj[uploadImageWno])) {
                vehObj[uploadImageWno].receipt = 1;
              }
            } else {
              inv.receipt = 1;
            }
          }
        }

        uploadImageWno = null
        nlApp.hidePleaseWait();
        $('#upload-receipt-image-dialog').modal('hide');
        resetTableRow();
      })
    }
  });

  function hasPrivilegePrice() {
    return local_user.privilege[7] === '1'
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////
  /// Function list
  ////////////////////////////////////////////////////////////////////////////////////////////////////////
  function enableButtons() {
    setHtmlElementDisabled(btnExport, curr_records.length === 0);

    calcSelectedSummary()

    if (selected_records.length || selectedInnerNo.length) {
      var len = selected_records.length + selectedInnerNo.length;
      if (len === 1) {
        setHtmlElementDisabled(singlePriceInput, false);
        setHtmlElementDisabled(btnUnshipDelay, false);
      } else {
        setHtmlElementDisabled(singlePriceInput, true);
        setHtmlElementDisabled(btnUnshipDelay, true);
      }

      setHtmlElementDisabled(batchPriceInput, len < 2);
      setHtmlElementDisabled(btnShowDetail, selected_records.length !== 1);
      setHtmlElementDisabled(btnSettle, false);
      setHtmlElementDisabled(btnSettleCancel, false);
      setHtmlElementDisabled(btnPrintDetail, false);
      setHtmlElementDisabled(btnPay, false);
      setHtmlElementDisabled(btnPayCancel, false);
    } else {
      setHtmlElementDisabled(singlePriceInput, true);
      setHtmlElementDisabled(batchPriceInput, true);
      setHtmlElementDisabled(btnShowDetail, true);
      setHtmlElementDisabled(btnUnshipDelay, true);
      setHtmlElementDisabled(btnSettle, true);
      setHtmlElementDisabled(btnSettleCancel, true);
      setHtmlElementDisabled(btnPrintDetail, true);
      setHtmlElementDisabled(btnPay, true);
      setHtmlElementDisabled(btnPayCancel, true);
    }

    if (hasPrivilegePrice()) {
      singlePriceInput.show()
      batchPriceInput.show()
      btnUnshipDelay.show()
    } else {
      singlePriceInput.hide()
      batchPriceInput.hide()
      btnUnshipDelay.hide()
    }
  }

  function buildPriceInputHtml(inv, forVessel, innerNo, withRemark = true) {
    var vehObj = getVehiclesInfo(inv, false);
    var msg = `<div class="row form-horizontal" style="padding: 15px 15px 0"><div class="col-md-11">
<div class="form-group">
  <label for="price-mode" class="control-label col-sm-4" style="padding-top: 12px;">输入方式</label>
  <div class="input-group col-sm-8" style="margin-bottom: 8px;">
    <div style="display: inline-flex">
      <label class="qd-radio-button"><input type="radio" name="price-mode" value="unit" checked><span class="qd-radio"></span> 每吨单价</label>
      <label class="qd-radio-button"><input type="radio" name="price-mode" value="bale"><span class="qd-radio"></span> 打包价</label>
    </div>
  </div>
</div>`;

    var common = '<div class="form-group"><label for="{0}" class="control-label col-sm-4">{1}</label><div class="input-group col-sm-8">';
    var str = common + `<input id="{2}" type="text" name="{3}" class="form-control" value="{4}"><span class="input-group-addon">&yen;</span>
  <span class="help-block" style="font-size: 11px; display: table-row">始发: {5}, 目的地: {6}, 发运重量: {7} 吨</span></div></div>`;
    var str_1 = common + `<input id="{2}" type="text" name="{3}" class="form-control" value="{4}" {5}><span class="input-group-addon">&yen;</span>
  <span class="help-block" style="font-size: 11px; display: table-row">始发: {6}, 发运重量: {7} 吨</span></div></div>`;

    var remark = '';
    if (forVessel) {
      var id = inv.waybill_no;
      msg += str.format(id, inv.vehicle_vessel_name, id, id, getStrValue(inv.vessel_price), inv.ship_from ? inv.ship_from : '', inv.ship_to, inv.total_weight);
      remark = inv.price_remark;
    } else {
      var html = '<div><label style="font-weight: bolder; margin-bottom: 10px;">设置目的地为船：<span style="color: blue;text-decoration: underline">' + inv.vehicle_vessel_name + '</span>&nbsp;的车辆价格</label>';
      if (vehObj && vehObj[innerNo]) {
        var tmp = vehObj[innerNo];
        var disabled = (tmp.price < 0) ? "disabled" : "";
        html += str_1.format(innerNo, tmp.name, innerNo, innerNo, getStrValue(tmp.price), disabled, tmp.ship_from ? tmp.ship_from : '', getStrValue(tmp.weight));
        remark = tmp.price_remark;
      }
      msg += html + '</div>';
    }

    if (withRemark) {
      msg += `
<div class="form-group" style="margin-top: 25px">
  <label for="price-remark" class="control-label col-sm-4">备注</label>
  <div class="input-group col-sm-8">
    <input id="price-remark" type="text" name="price-remark" class="form-control" value="{0}" />
  </div>
</div></div></div>`.format(remark ? remark : '');
    } else {
      msg += '</div></div>'
    }

    return msg;
  }

  function buildPriceDialog(inv, forVessel, innerNo) {
    bootbox.dialog({
      message: buildPriceInputHtml(inv, forVessel, innerNo, true),
      title: "单行价格输入",
      buttons: {
        cancel: { label: "取消", className: "btn-default" },
        main: { label: "确定", className: "btn-primary", callback: ok }
      }
    });

    $('input[name="price-mode"]').change(function () {
      var val = $(this).val()
      var jqId = '#' + inv.waybill_no;
      var elem = $(jqId);
      var inputVal = elem.val();
      elem.val('');

      var vehObj = getVehiclesInfo(inv, false);
      var w = inv.total_weight;
      if (forVessel) {
      } else if (vehObj && vehObj[innerNo]) {
        w = vehObj[innerNo].weight;
      }

      if (Number(inputVal) > 0) {
        if (val === 'unit') {
          elem.val(getStrValue(inputVal / w));
        } else {
          elem.val(getStrValue(inputVal * w))
        }
      }
    })

    function ok() {
      let val = $("input[name='price-mode']:checked").val();
      let priceMode = val === 'unit' ? 0 : 1;

      let pRemark = $('#price-remark').val();
      var priceData = [];
      if (forVessel) {
        var price = getPriceValue(inv.waybill_no); // id = inv.waybill_no
        if (price >= 0 || price === -1) {
          let unitPrice = 0;
          if (priceMode === 0) {
            inv.vessel_price = price;
            unitPrice = price;
          } else {
            inv.vessel_price = price / inv.total_weight;
            unitPrice = inv.vessel_price;
          }
          priceData.push({ wno: inv.waybill_no, price: price, inner: 0, mode: priceMode, unitPrice: unitPrice, remark: pRemark });
        }
      }
      else {
        var vehObj = getVehiclesInfo(inv, false);
        inv.bills.forEach(function (bill) {
          bill.vehicles.forEach(function (veh) {
            if (veh.inner_waybill_no === innerNo) {
              var price = getPriceValue(veh.inner_waybill_no); // id = inv.waybill_no
              if (price >= 0 || price === -1) {
                let unitPrice = 0;
                if (priceMode === 0) {
                  veh.veh_price = price;
                  vehObj[innerNo].price = price;
                  unitPrice = price;
                } else {
                  var p = price / veh.send_weight; // vehObj[innerNo].weight
                  veh.veh_price = p;
                  vehObj[innerNo].price = p;
                  unitPrice = p;
                }
                priceData.push({ wno: veh.inner_waybill_no, price: price, inner: 1, mode: priceMode, unitPrice: unitPrice, remark: pRemark });
              }
            }
          });
        });
      }

      // valid price and then send to backend
      if (priceData.length > 0) {
        ajaxRequestHandle('/settle_vessel_price', 'POST',
          { wnoList: [inv.waybill_no], priceData: priceData }, 'no_message', function () {
            updatePriceStateColumnText(inv, true, pRemark);
          });
      }
    }
  }

  function updatePriceStateColumnText(inv, forPrice, remark) {
    var tr;
    var color = (inv.vessel_price < 0) ? "darkgray" : "red";
    var vehObj = getVehiclesInfo(inv, false);
    var pText = getInvVesselPriceText(vehObj, inv);
    var numOfRow = tableBody.find("tr").length;
    for (var i = 0; i < numOfRow; ++i) {
      tr = getRowChildren(tableBody, i);
      var wno = getTableCellChildren(tr, 2).text();
      if (inv.waybill_no === wno) {
        if (forPrice) {
          tr.find("td").eq(0).find("label").css('color', color);
          tr.find("td").eq(8).html(pText.priceText);
          if (inv.vessel_price < 0) {
            tr.find("td").eq(9).text('无');
          } else {
            tr.find("td").eq(9).text(getStrValue(inv.vessel_price));
          }
        }
        tr.find("td").eq(1).html(getStrByStatus(inv.vessel_settle_state, inv.vessel_settle_state));
        tr.find("td").eq(13).text(date2Str(inv.vessel_settle_date));
        inv.price_remark = remark;
      }
      else if (vehObj && isExist(vehObj[wno])) {
        var tmp = vehObj[wno];
        if (forPrice) {
          if (tmp.price < 0) {
            tr.find("td").eq(0).find("label").css('color', "darkgray");
            tr.find("td").eq(8).text('无');
            tr.find("td").eq(9).text('无');
          } else {
            tr.find("td").eq(0).find("label").css('color', "red");
            tr.find("td").eq(8).text(getStrValue(tmp.price * tmp.weight));
            tr.find("td").eq(9).text(getStrValue(tmp.price));
          }
        }

        tr.find("td").eq(1).html(getStrByStatus(tmp.state, tmp.state));
        tr.find("td").eq(13).text(date2Str(tmp.date));
        tmp.price_remark = remark;
      }
    }
  }

  function generatePrice(mode, price, weight) {
    let unitPrice = 0;
    if (mode === 0) {
      unitPrice = price;
    } else {
      unitPrice = price / weight;
    }

    return unitPrice;
  }

  function buildPriceBatchInputDialog() {
    var vehNameWeightMap = new Map();
    var vehNameVesselWightMap = new Map();
    selected_records.forEach(function (record) {
      var val = vehNameWeightMap.get(record.vehicle_vessel_name);
      if (val) {
        val.total_weight += record.total_weight
        val.details.push({ wno: record.waybill_no, weight: record.total_weight })
      } else {
        vehNameWeightMap.set(record.vehicle_vessel_name,
          { total_weight: record.total_weight, price: record.vessel_price, details: [{ wno: record.waybill_no, weight: record.total_weight }], remark: record.price_remark });
      }
    });

    selectedInnerNo.forEach(function (innerNo) {
      var inv = getInvoiceByInnerNo(innerNo);
      inv.bills.forEach(function (bill) {
        bill.vehicles.forEach(function (veh) {
          if (veh.inner_waybill_no === innerNo) {
            var val = vehNameVesselWightMap.get(veh.veh_name);
            if (val) {
              val.total_weight += veh.send_weight
              val.details.push({ wno: veh.inner_waybill_no, weight: veh.send_weight })
            } else {
              vehNameVesselWightMap.set(veh.veh_name,
                { total_weight: veh.send_weight, price: veh.veh_price, details: [{ wno: veh.inner_waybill_no, weight: veh.send_weight }], remark: veh.price_remark });
            }
          }
        })
      })
    });

    var msg = `<div class="row form-horizontal" style="padding: 15px 15px 0"><div class="col-md-11">
<div class="form-group">
  <label for="batch-price-mode" class="control-label col-sm-4" style="padding-top: 12px;">输入方式</label>
  <div class="input-group col-sm-8" style="margin-bottom: 8px;">
    <div style="display: inline-flex">
      <label class="qd-radio-button"><input type="radio" name="batch-price-mode" value="unit" checked><span class="qd-radio"></span> 每吨单价</label>
      <label class="qd-radio-button"><input type="radio" name="batch-price-mode" value="bale"><span class="qd-radio"></span> 打包价</label>
    </div>
  </div>
</div>`;

    var common = '<div class="form-group"><label for="{0}" class="control-label col-sm-4">{1}</label><div class="input-group col-sm-8"><div style="display:flex;">';
    var str = common + `<input id="{2}" type="text" name="{3}" class="form-control" value="{4}"><span class="input-group-addon">&yen;</span><input id="{5}" type="text" name="{6}" value="{7}" style="margin-left: 15px" placeholder="备注" /></div>
  <span class="help-block" style="font-size: 11px; display: table-row">发运重量：{8} 吨</span></div></div>`;

    var id = "";
    vehNameWeightMap.forEach((value, key) => {
      id = key.replace(/[\s\(\)#]+/g, "999") + "999";
      const remarkId = `${id}-price-mark`
      msg += str.format(id, key, id, id, value.price, remarkId, remarkId, value.remark ? value.remark : '', getStrValue(value.total_weight));
    })
    var html = '<div class="col-md-12"><label>目的地为(船)的车辆</label>';
    if (vehNameVesselWightMap.size) {
      vehNameVesselWightMap.forEach((value, key) => {
        id = key.replace(/[\s\(\)#]+/g, "888") + "888";
        const remarkId = `${id}-price-mark`
        html += str.format(id, key, id, id, value.price, remarkId, remarkId, value.remark ? value.remark : '', getStrValue(value.total_weight));
      })
      msg += html + '</div>';
    }
    msg += '</div></div>';

    bootbox.dialog({
      message: msg,
      title: "批量输入价格",
      buttons: {
        cancel: { label: "取消", className: "btn-default", callback: function () { } },
        main: { label: "确定", className: "btn-primary", callback: ok }
      }
    });

    $('input[name="batch-price-mode"]').change(function () {
      let mode = $(this).val()
      let id = '';
      vehNameWeightMap.forEach((value, key) => {
        id = key.replace(/[\s\(\)#]+/g, "999") + "999";
        let elem = $('#' + id);
        let oldVal = elem.val();
        if (Number(oldVal) > 0) {
          elem.val(getStrValue(mode === 'unit' ? oldVal / value.total_weight : oldVal * value.total_weight))
        } else {
          elem.val('')
        }
      })
      vehNameVesselWightMap.forEach((value, key) => {
        id = key.replace(/[\s\(\)#]+/g, "888") + "888";
        let elem = $('#' + id);
        let oldVal = elem.val();
        if (Number(oldVal) > 0) {
          elem.val(getStrValue(mode === 'unit' ? oldVal / value.total_weight : oldVal * value.total_weight))
        } else {
          elem.val('')
        }
      })
    })

    function ok() {
      let val = $("input[name='batch-price-mode']:checked").val();
      let priceMode = val === 'unit' ? 0 : 1;

      var id = "";
      vehNameWeightMap.forEach((value, key) => {
        id = key.replace(/[\s\(\)#]+/g, "999") + "999";
        var p = getPriceValue(id);
        if (p >= 0 || p === -1) {
          value.price = p;
        }
        const remarkId = `#${id}-price-mark`
        value.remark = $(remarkId).val()
      })
      vehNameVesselWightMap.forEach((value, key) => {
        id = key.replace(/[\s\(\)#]+/g, "888") + "888";
        var p = getPriceValue(id);
        if (p >= 0 || p === -1) {
          value.price = p;
        }
        const remarkId = `#${id}-price-mark`
        value.remark = $(remarkId).val()
      })

      var allInv = [];
      var wnoList = [];
      var priceData = [];
      selected_records.forEach(function (record) {
        let value = vehNameWeightMap.get(record.vehicle_vessel_name);
        if (value.price >= 0 || value.price === -1) {
          const unitPrice = generatePrice(priceMode, value.price, value.total_weight)
          record.vessel_price = unitPrice;
          wnoList.push(record.waybill_no);
          priceData.push({ wno: record.waybill_no, price: record.vessel_price, inner: 0, mode: priceMode, unitPrice: unitPrice, remark: value.remark });
          record.remark = value.remark
          allInv.push(record);
        }
      });

      selectedInnerNo.forEach(function (innerNo) {
        var inv = getInvoiceByInnerNo(innerNo);
        inv.bills.forEach(function (bill) {
          bill.vehicles.forEach(function (veh) {
            if (veh.inner_waybill_no === innerNo) {
              let value = vehNameVesselWightMap.get(veh.veh_name);
              if (value && value.price >= 0 || value.price === -1) {
                const unitPrice = generatePrice(priceMode, value.price, value.total_weight)
                veh.veh_price = unitPrice;
                var vehObj = getVehiclesInfo(inv, false);
                if (vehObj) {
                  vehObj[innerNo].price = unitPrice;
                }

                if (wnoList.indexOf(inv.waybill_no) < 0) {
                  wnoList.push(inv.waybill_no);
                }

                priceData.push({ wno: innerNo, price: veh.veh_price, inner: 1, mode: priceMode, unitPrice: unitPrice, remark: value.remark });
                veh.price_remark = value.remark
                allInv.push(inv);
              }
            }
          })
        })
      });

      if (priceData.length) {
        ajaxRequestHandle('/settle_vessel_price', 'POST', { wnoList: wnoList, priceData: priceData }, 'no_message', function () {
          allInv.forEach(function (rec) {
            updatePriceStateColumnText(rec, true, rec.remark);
          });
        });
      }
    }
  }

  function getPriceValue(id) {
    var jqId = '#' + id;
    var value = parseFloatHTML($(jqId).val());
    if (isNaN(value) || value == 0) {
      return 0;
    } else {
      return value;
    }
  }

  function makeInvVehInfo(invoice) {
    var allVehicles = [];
    invoice.bills.forEach(function (bill) {
      allVehicles.push.apply(allVehicles, bill.vehicles);
    });

    var vehObj = {};
    allVehicles.forEach(function (veh) {
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
          unship_date: null, delay_day: 0, charge_cash: 0, charge_oil: 0, receipt: 0, remark: '',
          pay_date: null
        };
      }
    });

    if (isExist(invoice.inner_settle) && !isEmpty(invoice.inner_settle)) {
      invoice.inner_settle.forEach(function (innset) {
        // 防御性检查：确保 vehObj 中存在该 inner_waybill_no 对应的车辆
        if (vehObj[innset.inner_waybill_no]) {
          vehObj[innset.inner_waybill_no].state = innset.state;
          vehObj[innset.inner_waybill_no].date = innset.date;
          vehObj[innset.inner_waybill_no].unship_date = innset.unship_date;
          vehObj[innset.inner_waybill_no].delay_day = innset.delay_day;
          //vehObj[innset.inner_waybill_no].advance_charge_mode = innset.advance_charge_mode;
          //vehObj[innset.inner_waybill_no].advance_charge = innset.advance_charge;
          vehObj[innset.inner_waybill_no].charge_cash = innset.charge_cash;
          vehObj[innset.inner_waybill_no].charge_oil = innset.charge_oil;
          vehObj[innset.inner_waybill_no].receipt = innset.receipt;
          vehObj[innset.inner_waybill_no].remark = innset.remark;
          vehObj[innset.inner_waybill_no].pay_date = innset.pay_date;
        }
      })
    }

    return vehObj;
  }

  function getVehiclesInfo(invoice, created) {
    var vehObj;
    var found = false;
    for (var k = 0, len = allInvVehicles.length; k < len; ++k) {
      if (invoice.waybill_no === allInvVehicles[k].wno) {
        vehObj = allInvVehicles[k].vehInfo;
        found = true;
        break;
      }
    }
    if (!found && created) {
      vehObj = makeInvVehInfo(invoice);
      allInvVehicles.push({ wno: invoice.waybill_no, vehInfo: vehObj });
    }

    return vehObj;
  }

  function needMakeTr(no, carrier, isVessel, vehObj) {
    let need = false
    if (!carrier) {
      return false
    }

    if (carrierBoss && carrierBoss.length > 0) { // 已经选择了承运单位
      if (typeof carrier === 'string') {
        if (isVessel) {
          for (var key in vehObj) {
            if (vehObj.hasOwnProperty(key)) {
              const vehCarrier = local_data.vehPersonMap[vehObj[key].name];
              if (carrierBoss === vehCarrier) {
                need = true
              }
            }
          }
        } else {
          return carrier === carrierBoss
        }
      } else if (carrier.real_boss && carrier.real_boss.length) {
        if (isVessel) {
          for (var key in vehObj) {
            if (vehObj.hasOwnProperty(key)) {
              carrier.real_boss.forEach((elem) => {
                if (elem.waybill_no === key && elem.rb === carrierBoss) {
                  need = true
                }
              })
            }
          }
        } else {
          carrier.real_boss.forEach((elem) => {
            if (elem.waybill_no === no && elem.rb === carrierBoss) {
              need = true
            }
          })
        }
      }
    } else {
      need = true
    }

    return need
  }

  function getCarrierCompany(no, carrier) {
    if (typeof carrier === 'string') {
      return carrier
    } else {
      let html = '<select class="form-control carrier-change">'
      let res = ''
      let found = false
      if (carrier.real_boss && carrier.real_boss.length) {
        carrier.real_boss.forEach((elem) => {
          if (elem.waybill_no === no) {
            found = true
            res = elem.rb
          }
        })
      }

      if (!found) {
        html += '<option value="" selected disabled>-- 请选择 --</option>'
      }

      const list = carrier.boss.split(/,|，/);
      list.forEach((boss) => {
        let tmp = boss.trim();
        if (tmp === res) {
          html += '<option value="' + boss + '" selected>' + boss + '</option>'
        } else {
          html += '<option value="' + boss + '">' + boss + '</option>'
        }
      })

      return html
    }
  }

  function getParameterText(state, receipt, cash, oil, remark) {
    var color = (state === '不需要结算') ? "gray" : "red";
    var show = remark ? "" : "display:none";
    var ckReceipt = '<div style="display: flex; align-items: center; justify-content: center; gap: 5px">';
    const mark = '<i class="fa fa-info-circle" style="color:red; cursor:pointer; ' + show + '" data-toggle="tooltip" title="' + remark + '"></i>'
    const see = '<button class="see-img qd-button" style="white-space: nowrap;" data-toggle="tooltip" title="查看回执图片">查看</button>'
    const upload = '<button class="upload-img qd-button" style="white-space:nowrap;" data-toggle="tooltip" title="无回执，上传回执图片">上传</button>'
    const upload1 = '<button class="upload-img qd-button" style="white-space:nowrap;" data-toggle="tooltip" title="上传回执图片，可修改回执">上传</button>'
    if (receipt === 1) {
      ckReceipt = `${ckReceipt} ${see} ${upload1} ${mark}</div>`
    } else {
      ckReceipt = `${ckReceipt} ${upload}</div>`
    }

    var text = '无';
    if (cash > 0 && oil > 0) {
      text = '现金:' + cash + ',油:' + oil;
    } else if (cash > 0) {
      text = '现金:' + cash;
    } else if (oil > 0) {
      text = '油:' + oil;
    }
    text = '<div style="display: flex; align-items: center; justify-content: center;">' + text + '</div>';

    return { state: getStrByStatus(state, state), color: color, ckReceipt: ckReceipt, chargeText: text };
  }

  function getVesselVehInfo(inv) {
    var isVessel = false;
    var vehObj = null;
    var number = 0;
    inv.bills.forEach(function (bill) {
      number += bill.num;
      if (!isVessel && bill.vehicles.length) {
        isVessel = true;
        vehObj = getVehiclesInfo(inv, true);
      }
    });

    return { isVessel: isVessel, vehObj: vehObj, number: number }
  }

  var allReceipts = []
  function makeTableTrHtml(inv, isVessel, vehObj, number) {
    var allReceiptOk = true;
    var allNotNeed = true;
    var name = inv.ship_name + (inv.ship_customer ? "/" + inv.ship_customer : "");

    var vehName = qFilter.getVehicleName();
    if ((!vehName || vehName === inv.vehicle_vessel_name) && (qFilter.settledState === inv.vessel_settle_state) || qFilter.settledState === '全部') {
      allReceiptOk = (inv.receipt === 1);
      allNotNeed = (inv.vessel_price < 0);
      var paramText = getParameterText(inv.vessel_settle_state, inv.receipt, inv.charge_cash, inv.charge_oil, inv.remark);

      allReceipts.push(inv.receipt);

      var trHtml = '<tr class="tr_header"><td nowrap><input class="select-inv" type="checkbox">&nbsp;<label class="fa fa-star-o not-need-settle" data-toggle="tooltip" title="点击可设置不需要结算和需要结算" style="cursor:pointer; color:' + paramText.color + '; font-size:18px;"></label>';
      if (isVessel) {
        trHtml += '&nbsp;<span data-toggle="tooltip" title="点击展开和收缩" style="cursor:pointer;font-size: 16px;" class="fa fa-minus-square-o expand"></span>';
      }
      trHtml += `</td><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td>
      <td>{7}</td><td data-toggle="tooltip" title="{17}">{8}</td><td>{9}</td><td>{10}</td><td>{11}</td><td>{12}</td><td>{13}</td><td>{14}</td><td nowrap>{15}</td>
      <td style="text-align: center; padding: 0 3px;">{16}</td></tr>`;

      var pText = getInvVesselPriceText(vehObj, inv);
      totalAmount += pText.price;
      totalWeight += inv.total_weight;

      if (inv.charge_cash > 0) {
        prePayment += inv.charge_cash;
      }
      if (inv.charge_oil > 0) {
        prePayment += inv.charge_oil;
      }

      var carrierBoss = getCarrierCompany(inv.waybill_no, local_data.vehPersonMap[inv.vehicle_vessel_name]);


      let tPrice = pText.priceText;
      let sPrice = inv.vessel_price < 0 ? '无' : getStrValue(inv.vessel_price);
      if (local_user.privilege[7] !== '1') {
        tPrice = '<span class="blurred-price">***</span>';
        sPrice = '<span class="blurred-price">***</span>';
      }

      tableBody.append(
        trHtml.format(
          paramText.state,
          inv.waybill_no,
          inv.vehicle_vessel_name,
          carrierBoss ? carrierBoss : '',
          name,
          inv.ship_from,
          inv.ship_to,
          tPrice, sPrice,
          number,
          getStrValue(inv.total_weight),
          date2Str(inv.ship_date),
          date2Str(inv.vessel_settle_date),
          date2Str(inv.unship_date, true),
          inv.delay_day,
          paramText.chargeText,
          paramText.ckReceipt,
          inv.price_remark ? inv.price_remark : ''
        ));
    }

    if (isVessel) {
      var s = `<tr class="vessel_sub_item" style="background: #e0e4f0;"><td nowrap><input class="select-sub-inv" type="checkbox">&nbsp;<label class="fa fa-star-o not-need-settle" data-toggle="tooltip" title="点击可设置不需要结算和需要结算" style="cursor:pointer; color:{17}; font-size:18px;"></label></td>
        <td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td>
        <td>{8}</td><td>{9}</td><td>{10}</td><td>{11}</td><td>{12}</td><td>{13}</td><td>{14}</td><td nowrap>{15}</td>
        <td style="text-align: center; padding: 0 3px;">{16}</td></tr>`;

      for (var key in vehObj) {
        if (vehObj.hasOwnProperty(key) && ((!vehName || vehName === vehObj[key].name) && (qFilter.settledState === vehObj[key].state || qFilter.settledState === '全部'))) {
          var tmp = vehObj[key];
          var hint = '无', vehPriceText = '无';

          //totalAmount += tmp.num;
          totalWeight += tmp.weight;

          if (tmp.price >= 0) {
            var tp = tmp.price * tmp.weight;
            hint = getStrValue(tmp.price);
            vehPriceText = getStrValue(tp);
            totalAmount += tp;
          }

          if (tmp.charge_cash > 0) {
            prePayment += tmp.charge_cash;
          }
          if (tmp.charge_oil > 0) {
            prePayment += tmp.charge_oil;
          }

          allReceiptOk = allReceiptOk && (tmp.receipt === 1);
          allNotNeed = allNotNeed && (tmp.price < 0);
          paramText = getParameterText(tmp.state, tmp.receipt, tmp.charge_cash, tmp.charge_oil, tmp.remark);

          allReceipts.push(tmp.receipt);

          var vCarrierBoss = getCarrierCompany(key, local_data.vehPersonMap[tmp.name]);

          let tPrice = vehPriceText;
          let sPrice = hint;
          if (local_user.privilege[7] !== '1') {
            tPrice = '<span class="blurred-price">***</span>';
            sPrice = '<span class="blurred-price">***</span>';
          }

          tableBody.append(
            s.format(
              paramText.state,
              key,
              tmp.name, vCarrierBoss ? vCarrierBoss : '',
              name,
              tmp.ship_from ? tmp.ship_from : '',
              inv.vehicle_vessel_name,
              tPrice, sPrice,
              tmp.num,
              getStrValue(tmp.weight),
              date2Str(inv.ship_date),
              date2Str(tmp.date),
              date2Str(tmp.unship_date, true),
              tmp.delay_day,
              paramText.chargeText,
              paramText.ckReceipt,
              paramText.color));
        }
      }
    }

    return { receiptOk: allReceiptOk, notNeed: allNotNeed };
  }

  function getTableRow(e, me) {
    e.stopImmediatePropagation();
    e.stopPropagation();
    return me.closest('tr');
  }

  function resetTableRow() {
    tableBody.empty();
    selected_records = [];
    selectedInnerNo = [];
    totalAmount = 0;
    totalWeight = 0;
    prePayment = 0;

    var allNotNeed = true;
    allReceipts = [];
    curr_records.forEach(function (inv) {
      // 如果有发货单位筛选，则跳过不在选中列表中的记录
      if (shipFilterSelected.length) {
        var sc = inv.ship_customer ? inv.ship_customer : '';
        if (shipFilterSelected.indexOf(sc) < 0) {
          return; // 相当于跳过此条记录
        }
      }

      let { isVessel, vehObj, number } = getVesselVehInfo(inv)
      if (needMakeTr(inv.waybill_no, local_data.vehPersonMap[inv.vehicle_vessel_name], isVessel, vehObj)) {
        var res = makeTableTrHtml(inv, isVessel, vehObj, number);
        if (!res.receiptOk) {
          allReceiptOk = false;
        }
        if (!res.notNeed) {
          allNotNeed = false;
        }
      }
    });

    if (allReceiptOk) {
      ckReceiptIcon.addClass('fa-check-square-o');
      ckReceiptIcon.removeClass('fa-square-o');
    } else {
      ckReceiptIcon.removeClass('fa-check-square-o');
      ckReceiptIcon.addClass('fa-square-o');
    }

    if (allNotNeed) {
      $('#all-not-need').css('color', 'gray');
    } else {
      $('#all-not-need').css('color', 'red');
    }

    $('#lb-total-weight').text(getStrValue(totalWeight));
    if (hasPrivilegePrice()) {
      $('#lb-total-amount').text(getStrValue(totalAmount));
    }
    $('#curr-number').text(tableBody.find("tr").length);
    $('#lb-unpay-amount').text(getStrValue(totalAmount - prePayment));
    $('#select-all').prop("checked", false);

    enableButtons();

    let isSelectClicked = false;
    $('tr.tr_header').on('click', function (e) {
      if (isSelectClicked) {
        isSelectClicked = false; // 重置标记
      } else {
        selectRow($(this), true);
      }
    });
    $('.vessel_sub_item').on('click', function () {
      selectInnerRow($(this), true);
    });
    $('.select-inv').on('click', function () {
      selectRow($(this).closest('tr'), false);
    });
    $('.select-sub-inv').on('click', function () {
      selectInnerRow($(this).closest('tr'), false);
    });

    $('.expand').on('click', function (e) {
      var me = $(this)
      var tr = getTableRow(e, me)
      switchElementClass(me, 'fa-plus-square-o', 'fa-minus-square-o');
      tr.nextUntil('tr.tr_header').slideToggle(100, function () { });
    });

    $('.not-need-settle').on('click', function (e) {
      var me = $(this)
      var tr = getTableRow(e, me)
      if (qFilter.settledState === '未结算') {
        var wno = getTableCellChildren(tr, 2).text();
        switchNotNeedSettle(me, [wno]);
      } else {
        bootbox.alert('已结算,不能再进行"不需要结算操作"');
      }
    });

    $('.upload-img').click(function (e) {
      var me = $(this)
      var tr = getTableRow(e, me)
      uploadImageWno = getTableCellChildren(tr, 2).text();
      $('#preview-receipt-image').attr('src', '').hide();
      $('#upload-receipt-hint').show();
      $('#upload-receipt-image-dialog').modal({ backdrop: 'static', keyboard: false }).modal('show');
    })

    $('.see-img').click(function (e) {
      var me = $(this)
      var tr = getTableRow(e, me)
      var wno = getTableCellChildren(tr, 2).text();
      nlApp.setTitle('正在打开回执, 请稍等...');
      nlApp.showPleaseWait();
      try {
        $.get('/get-receipt-img', { q: wno }, function (response) {
          if (response && response.ok) {
            const dataUrl = 'data:' + response.contentType + ';base64,' + response.data;
            // 将 Data URL 设置为图片的源
            $('#display-receipt-image').attr('src', dataUrl).show();
            $('#receipt-image-dialog').modal({ backdrop: 'static', keyboard: false }).modal('show');
            nlApp.hidePleaseWait();

            $('#display-receipt-image').on('click', function () {
              const originalImageModal = $('#original-image-modal');
              if (!originalImageModal.length) {
                $('body').append(`
<div class="modal fade" id="original-image-modal" tabindex="-1" role="dialog" aria-labelledby="originalImageModalLabel" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered" role="document" style="max-width: 90vw; max-height: 90vh; width: 90vw; height: 90vh;">
    <div class="modal-content" style="width: 100%; height: 100%;">
      <div class="modal-header">
        <button class="close" type="button" data-dismiss="modal" aria-label="Close" style="margin-top: -10px">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div style="padding: 0; overflow: auto; height: calc(100% - 50px);">
        <img id="original-image" src="${dataUrl}" style="width: 100%; height: auto;" />
      </div>
    </div>
  </div>
</div>`);
              } else {
                $('#original-image').attr('src', dataUrl);
              }
              $('#original-image-modal').modal('show');
            });
          } else {
            bootbox.alert('读取回执失败')
            nlApp.hidePleaseWait()
          }
        });
      } catch (e) {
        nlApp.hidePleaseWait();
      }
    })

    $('.carrier-change').on('mousedown mouseup change', function (e) {
      var me = $(this)
      var tr = getTableRow(e, me)
      if (e.type === 'mousedown' || e.type === 'mouseup') {
        isSelectClicked = true
      } else if (e.type === 'change') {
        var wno = getTableCellChildren(tr, 2).text();
        var vName = getTableCellChildren(tr, 3).text();
        let request = getAJAXRequest('/post-carrier-department', 'POST', { vehName: vName, wno: wno, boss: me.val() })
        request.done((data) => {
          if (data.ok) {
            const veh = data.data;
            local_data.vehPersonMap[veh.name] = { boss: veh.boss, real_boss: veh.real_boss };
          }
        })
        request.fail((jqXHR, textStatus) => {
          bootbox.alert("设置承运单位失败: " + textStatus);
        })
      }
    })

    $('[data-toggle="popover"]').popover({ trigger: "hover", html: true, placement: "bottom" });
  }

  function calcSelectedSummary() {
    selectedTotalAmount = 0
    selectedTotalWeight = 0
    var numOfRow = tableBody.find("tr").length;
    for (var i = 0; i < numOfRow; ++i) {
      var tr = getRowChildren(tableBody, i);
      var wno = getTableCellChildren(tr, 2).text();
      var amount = getTableCellChildren(tr, 8).text();
      var weight = getTableCellChildren(tr, 11).text();
      if (selectedInnerNo.length && selectedInnerNo.indexOf(wno) >= 0) {
        selectedTotalAmount += Number(amount)
        selectedTotalWeight += Number(weight)
      } else if (selected_records.length) {
        selected_records.forEach(function (rec) {
          if (rec.waybill_no === wno) {
            selectedTotalAmount += Number(amount)
            selectedTotalWeight += Number(weight)
          }
        })
      }
    }

    if (selectedTotalWeight > 0) {
      $('#selected-summary').show()
      $('#lb-selected-total-weight').text(getStrValue(selectedTotalWeight));
      $('#lb-selected-total-amount').text(getStrValue(selectedTotalAmount));
    } else {
      $('#selected-summary').hide()
    }
  }

  function selectInnerRow(me, needUpdateCheckBox) {
    var innerNo = getTableCellChildren(me, 2).text();
    var idx = selectedInnerNo.indexOf(innerNo);
    if (idx < 0) {
      selectedInnerNo.push(innerNo);
      //      me.addClass('invoice-highlighted');
    } else {
      selectedInnerNo.remove(idx);
      //      me.removeClass('invoice-highlighted');
    }

    if (needUpdateCheckBox) {
      me.find('td:first').find('input[type="checkbox"]').prop("checked", (idx < 0));
    }

    $('#select-all').prop("checked", (selected_records.length + selectedInnerNo.length) === tableBody.find("tr").length);
    enableButtons();
  }

  function selectRow(me, needUpdateCheckbox) {
    if (me.hasClass("tr_header")) {
      var wno = getTableCellChildren(me, 2).text();
      var found = false;
      for (var i = 0; i < selected_records.length; ++i) {
        if (wno === selected_records[i].waybill_no) {
          selected_records.remove(i);
          found = true;
          break;
        }
      }

      if (found) {
        me.removeClass('invoice-highlighted');
      } else {
        for (var k = 0, l = curr_records.length; k < l; ++k) {
          if (wno === curr_records[k].waybill_no) {
            selected_records.push(curr_records[k]);
            break;
          }
        }
        me.addClass('invoice-highlighted');
      }

      if (needUpdateCheckbox) {
        me.find('td:first').find('input[type="checkbox"]').prop("checked", !found);
      }

      $('#select-all').prop("checked", (selected_records.length + selectedInnerNo.length) === tableBody.find("tr").length);
      enableButtons();
    }
  }

  function switchNotNeedSettle(me, wlist) {
    var color = me.css('color');
    if (color === 'rgb(255, 0, 0)') {
      me.css('color', 'gray');
      settleNotNeeded(wlist, true);
    } else {
      me.css('color', 'red');
      settleNotNeeded(wlist, false);
    }
  }

  function switchElementClass(elem, oc, nc) {
    if (elem.hasClass(oc)) {
      elem.addClass(nc);
      elem.removeClass(oc);
    }
    else if (elem.hasClass(nc)) {
      elem.addClass(oc);
      elem.removeClass(nc);
    }
  }

  function settleNotNeeded(wlist, notNeeded) {
    ajaxRequestHandle('/settle_vessel_not_needed', 'POST', { wayNoList: wlist, notNeeded: notNeeded }, 'no_message', function () {
      wlist.forEach(function (wno) {
        var waybillNo = wno;
        if (wno.length > 17) {
          waybillNo = wno.substring(0, 17);
        }
        for (var i = 0; i < curr_records.length; ++i) {
          if (waybillNo === curr_records[i].waybill_no) {
            var inv = curr_records[i];
            if (wno.length > 17) {
              inv.bills.forEach(function (bill) {
                bill.vehicles.forEach(function (bveh) {
                  if (wno === bveh.inner_waybill_no) {
                    bveh.veh_price = notNeeded ? -1 : 0;
                  }
                })
              });

              var vehObj = getVehiclesInfo(inv, false);
              if (vehObj && isExist(vehObj[wno])) {
                if (notNeeded) {
                  vehObj[wno].price = -1;
                  vehObj[wno].date = new Date();
                  vehObj[wno].state = '不需要结算';
                } else {
                  vehObj[wno].price = 0;
                  vehObj[wno].date = null;
                  vehObj[wno].state = '未结算';
                }
              }

              inv.inner_settle.forEach(function (inner) {
                if (inner.inner_waybill_no === wno) {
                  if (notNeeded) {
                    inner.date = new Date();
                    inner.state = '不需要结算';
                  } else {
                    inner.date = null;
                    inner.state = '未结算';
                  }
                }
              })
            } else {
              if (notNeeded) {
                inv.vessel_price = -1;
                inv.vessel_settle_state = '不需要结算';
                inv.vessel_settle_date = new Date();
              } else {
                inv.vessel_price = 0;
                inv.vessel_settle_state = '未结算';
                inv.vessel_settle_date = null;
              }
            }

            updatePriceStateColumnText(inv, true, '');
            break;
          }
        }
      })
    });
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

    if (inv.vessel_price < 0) {
      return { priceText: '<code style="color: darkgray">无</code>', tooltip: tip, price: 0 };
    } else {
      var p = inv.vessel_price * inv.total_weight;
      return {
        priceText: '<code style="color: blue">' + getStrValue(p) + '</code>',
        tooltip: tip,
        price: p
      };
    }
  }

  // Export function
  elementEventRegister(btnExport, 'click', function () {
    var data = [];
    var numOfRow = tableBody.find("tr").length;
    for (var i = 0; i < numOfRow; ++i) {
      var tr = getRowChildren(tableBody, i);
      var row = []
      for (var c = 1; c < 18; ++c) {
        var td = tr.find('td:eq(4)');
        var text = getTableCellChildren(tr, c).text()
        if (c === 2) {
          text = `"${text}-"`;
        } else if (c === 17) {
          text = allReceipts[i] === 1 ? '已回执' : '未回执';
        } else if (c === 16) {
          if (text !== '无') {
            text = text.replace(',', '，')
          }
          //        } else if (c === 4) {
          //          var selected = td.find('option:selected')
          //          if (selected !== null) {
          //            text = selected.text();
          //            console.log(text);
          //          }
        }

        row.push(text)
      }
      data.push(row)
    }

    var columns = ["状态", '运单号', '车船号', '承运单位', "开单名称/发货单位", '起始地', '目的地', '总价格', '单价', "发运块数", "发运重量", "发货日期", "结算日期", "卸船日期", "滞留天数", "预付", "回执"]
    excelExport({ fileName: '车船结算', suffix: 'csv', titles: columns, dataSource: data })
  });

  elementEventRegister(btnFilter, 'click', function () { $('#filter-ui').toggle() });
});

/////////////////////////////////////////
//////// CLASS DEFINE////////////////////
/////////////////////////////////////////
var QueryFilterD = function (options) {
  this.uiElems = {
    sBfBillName: $('#bf-bill-name'),
    sBfDest: $('#bf-destination'),
    sBfVehicle: $('#bf-vehicle'),
    sBfVehContact: $('#bf-vehicle-contact'),
    startDateGrp: $('#start-date-grp'),
    endDateGrp: $('#end-date-grp'),
    iStartDate: $('#start-date'),
    iEndDate: $('#end-date'),
    sSettle: $('#settle-select'),
    // rSettled: $('#vessel-settled'),
    // rNoSettled: $('#no-vessel-settled'),
    // rSettledPay: $('#vessel-pay'),
    // rSettledNotNeeded: $('#vessel-no-need-settled'),
    iAmount: $('#q-amount'),
    iWeight: $('#q-weight'),
    sBfReceipt: $('#receipt-select')
  };

  this.options = options;
  initSelect(this.uiElems.sBfBillName, options.nameList, true);
  initSelect(this.uiElems.sBfVehicle, options.vehList, true);
  initSelect(this.uiElems.sBfDest, options.destList, true);
  initSelect(this.uiElems.sBfVehContact, options.contactNameList, true);
  // this.uiElems.rNoSettled.iCheck('check');//.prop('checked', false);
  this.uiElems.iStartDate.val("");
  this.uiElems.iEndDate.val("");

  this.uiElems.sBfBillName.select2({ allowClear: true });
  this.uiElems.sBfVehicle.select2({ allowClear: true });
  this.uiElems.sBfDest.select2({ allowClear: true });
  this.uiElems.sBfVehContact.select2({ allowClear: true });
  this.selectedVeh;

  this.currSelected = 0;
  this.settledState = '未结算';
  // this.sDate = null;
  // this.eDate = null;
  this.eDate = moment();
  this.sDate = moment().subtract(1, 'months');
  var startGrp = this.uiElems.startDateGrp.datetimepicker(getDateTimePickerOptions());
  var endGrp = this.uiElems.endDateGrp.datetimepicker(getDateTimePickerOptions());
  this.uiElems.endDateGrp.data("DateTimePicker").setDate(this.eDate);
  this.uiElems.startDateGrp.data("DateTimePicker").setDate(this.sDate);

  this._selectFliterFunc = function (which, filter) {
    this.currSelected = which;
    if (this.isAllEmpty()) {
      //filter(false, true);       // return to initial state
    }
    else {
      //filter(true, false);
    }
  };

  this._dateFilterFunc = function (isStart, isEnd, filter) {
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
      //filter(true, false);
    }
  }
};

QueryFilterD.prototype.getQueryParams = function () {
  var vehContact = getSelectValue(this.uiElems.sBfVehContact);
  var name = getSelectValue(this.uiElems.sBfBillName);
  var dest = getSelectValue(this.uiElems.sBfDest);
  var d1 = this.uiElems.iStartDate.val();
  var d2 = this.uiElems.iEndDate.val();
  var b = !isEmpty(d1) && !isEmpty(d2);
  var receiptSelected = Number(this.uiElems.sBfReceipt.val());

  return {
    fName: name ? name : null,
    fVeh: this.selectedVeh ? this.selectedVeh : null,
    fDest: dest ? dest : null,
    fSettledState: this.settledState,
    // fDate1: b ? this.sDate.toISOString() : null,
    // fDate2: b ? this.eDate.toISOString(): null
    fDate1: b ? moment(d1).startOf('day').format('YYYY-MM-DD HH:mm:ss') : null,
    fDate2: b ? moment(d2).endOf('day').format('YYYY-MM-DD HH:mm:ss') : null,
    selfOwned: this.options.selfOwned,
    fContact: vehContact ? vehContact : null,
    fAmount: this.uiElems.iAmount.val(),
    fWeight: this.uiElems.iWeight.val(),
    fReceipt: receiptSelected
  };
};

QueryFilterD.prototype.getVehicleName = function () {
  return this.selectedVeh;
};

QueryFilterD.prototype.eventHandler = function (filter) {
  var self = this;
  self.uiElems.sBfBillName.on('change', function () {
    self._selectFliterFunc(1, filter);
  });
  self.uiElems.sSettle.on('change', function () {
    self.settledState = this.value
    self._selectFliterFunc(2, filter);
  })
  self.uiElems.sBfVehicle.on('change', function (e) {
    self.selectedVeh = e.val;
    if (self.selectedVeh === '无-取消选择') self.selectedVeh = '';

    self._selectFliterFunc(3, filter);
  });
  self.uiElems.sBfVehContact.on('change', function () {
    self.currSelected = 6;
    //filter(false, false);
  });
  self.uiElems.sBfDest.on('change', function () {
    self._selectFliterFunc(4, filter);
  });

  self.uiElems.startDateGrp.datetimepicker(getDateTimePickerOptions()).on('dp.change', function (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    self.sDate = e.date.startOf('day');
    self.uiElems.endDateGrp.data("DateTimePicker").setMinDate(e.date);
    self._dateFilterFunc(true, true, filter);
  });
  self.uiElems.endDateGrp.datetimepicker(getDateTimePickerOptions()).on('dp.change', function (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    self.eDate = e.date.endOf('day');
    self.uiElems.startDateGrp.data("DateTimePicker").setMaxDate(e.date);
    self._dateFilterFunc(true, true, filter);
  });

  // 设置只能查询一年以内的数据
  if (local_user.privilege === '11111111') {
    setDateGrpMinMaxRange(self.uiElems.startDateGrp, self.uiElems.endDateGrp, 120);
  } else {
    setDateGrpMinMaxRange(self.uiElems.startDateGrp, self.uiElems.endDateGrp);
  }

  self.uiElems.iStartDate.on('change', function (e) {
    e.stopImmediatePropagation();
    self._dateFilterFunc(true, false, filter);
  });
  self.uiElems.iEndDate.on('change', function (e) {
    e.stopImmediatePropagation();
    self._dateFilterFunc(false, true, filter);
  });
};

QueryFilterD.prototype.isAllEmpty = function () {
  var dest = getSelectValue(this.uiElems.sBfDest);
  var name = getSelectValue(this.uiElems.sBfBillName);
  var d1 = this.uiElems.iStartDate.val();
  var d2 = this.uiElems.iEndDate.val();
  return isEmpty(this.selectedVeh) && isEmpty(dest) && isEmpty(name) && isEmpty(d1) && isEmpty(d2);
};

QueryFilterD.prototype.updateOptions = function (records, reset) {
  var vehicle = this.selectedVeh;
  var vehicleContactName = getSelectValue(this.uiElems.sBfVehContact);
  var dest = getSelectValue(this.uiElems.sBfDest);
  var name = getSelectValue(this.uiElems.sBfBillName);
  var nOptions = { vehList: [], destList: [], contactNameList: [] };
  var visibleRecs = [];

  var clearContactName = false;
  if (this.currSelected === 6 && !vehicleContactName) {
    vehicle = '';
    this.selectedVeh = '';
    clearContactName = true;
  }

  if (!vehicle && this.currSelected === 3) {
    vehicleContactName = null;
  }

  if (reset) {
    nOptions = this.options;
    visibleRecs = records;
    records.forEach(function (bill) {
      if (bill.ship_to && nOptions.destList.indexOf(bill.ship_to) < 0) {
        nOptions.destList.push(bill.ship_to);
      }
    });
  } else {
    var vList = [], dList = [], k, m;
    var allVehList = [];
    if (vehicleContactName) {
      var pList = this.options.vehPersonMap;
      for (var key in pList) {
        if (pList[key] === vehicleContactName) {
          allVehList.push(key);
        }
      }
    }

    records.forEach(function (rec) {
      var b2 = false;
      if (clearContactName) {
        b2 = false;
      } else if (allVehList.length) {
        if (allVehList.indexOf(rec.vehicle_vessel_name) >= 0) {
          b2 = true;
        } else {
          for (k = 0; k < rec.bills.length; ++k) {
            for (m = 0; m < rec.bills[k].vehicles.length && !b2; ++m) {
              if (allVehList.indexOf(rec.bills[k].vehicles[m].veh_name) >= 0) {
                b2 = true;
                break;
              }
            }
          }
        }
      }
      else if (vehicle) {
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
        visibleRecs.push(rec);
        if (rec.ship_to && dList.indexOf(rec.ship_to) < 0) {
          dList.push(rec.ship_to);
        }

        if (allVehList.length === 0) {
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
      }
    });

    nOptions.vehList = sort_pinyin(allVehList.length ? allVehList : vList);
    nOptions.destList = sort_pinyin(dList);

    if (this.currSelected === 6) {
      if (this.isAllEmpty() && !vehicleContactName) {
        nOptions.vehList = this.options.vehList;
        nOptions.destList = this.options.destList;
      }
    } else if (nOptions.vehList.length) {
      var nList = this.options.vehPersonMap;
      nOptions.vehList.forEach(function (nv) {
        var cname = nList[nv];
        if (cname && nOptions.contactNameList.indexOf(cname) < 0) {
          nOptions.contactNameList.push(cname);
        }
      });

      nOptions.contactNameList = sort_pinyin(nOptions.contactNameList);
    }
  }

  var contactName = (vehicle) ? this.options.vehPersonMap[vehicle] : null;

  if (this.currSelected === 2) {
    initSelect(this.uiElems.sBfVehicle, nOptions.vehList, true);
    this.uiElems.sBfVehicle.select2('val', this.selectedVeh);
    initSelect(this.uiElems.sBfDest, nOptions.destList, true, dest);
    initSelect(this.uiElems.sBfVehContact, nOptions.contactNameList, true, contactName);
  }
  else if (this.currSelected === 3) {
    initSelect(this.uiElems.sBfDest, nOptions.destList, true, dest);
    if (contactName) {
      this.uiElems.sBfVehContact.val(contactName);
    } else {
      unselected(this.uiElems.sBfVehContact);
    }
  }
  else if (this.currSelected === 6) {
    initSelect(this.uiElems.sBfVehicle, nOptions.vehList, true);
    this.uiElems.sBfVehicle.select2('val', this.selectedVeh);
    initSelect(this.uiElems.sBfDest, nOptions.destList, true);
    if (!vehicleContactName) {
      initSelect(this.uiElems.sBfVehContact, this.options.contactNameList, true);
    }
  }
  else if (this.currSelected === 4) {
    initSelect(this.uiElems.sBfVehicle, nOptions.vehList, true);
    this.uiElems.sBfVehicle.select2('val', this.selectedVeh);
    initSelect(this.uiElems.sBfVehContact, nOptions.contactNameList, true, contactName);
  }
  else {
    initSelect(this.uiElems.sBfVehicle, nOptions.vehList, true);
    this.uiElems.sBfVehicle.select2('val', this.selectedVeh);
    initSelect(this.uiElems.sBfDest, nOptions.destList, true, dest);
    initSelect(this.uiElems.sBfVehContact, nOptions.contactNameList, true, contactName);
  }

  return visibleRecs;
};
