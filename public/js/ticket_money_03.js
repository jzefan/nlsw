/**
 * Created by ezefjia on 11/19/2014.
 */

$(function () {
  "use strict";

  var tableBody = $('#table-tbody');

  // initialize
  var dbSettles = local_dbData.settles;
  var dbBills = [];
  var curr_settles = [];
  var selected_settles = [];
  var visible_settles = dbSettles;
  var action = "CUSTOMER";
  var CUSTOMER_SETTLE_FLAG = 1; // 0001
  var COLLECTION_SETTLE_FLAG = 2; // 0010

  var btnCustomer = $('#customer-btn');
  var btnCollection = $('#collection-btn');
  var btnSettleDelete = $('#settle-delete');
  var btnTicketOk = $('#settle-ticket');
  var btnTicketCancel = $('#settle-ticket-cancel');
  var btnMoneyOk = $('#settle-money');
  var btnMoneyCancel = $('#settle-money-cancel');
  var btnFilter = $('#filter');
  var btnExport = $('#search-export');
  var btnShowDetail = $('#show-detail');
  var btnRealPrice = $('#real-price-input');
  var ticketNoDlg = $('#ticket-no-dialog');
  var ticketNoDlgOk = $('#ticket-no-ok');
  var ticketNoInput = $('#ticket-no-input');
  var ticketNeeded = $('input[name="ticket-need"]');

  var $rangeOne = $('input[name="rangeOne"]'),
    $rangeTwo = $('input[name="rangeTwo"]'),
    $outputOne = $('.outputOne'),
    $outputTwo = $('.outputTwo'),
    $inclRange = $('.incl-range');

  var timeout; // 定义一个变量来存储定时器

  // 计算列表中总价格的最大，最小值
  var max = 0, min = 10000;
  dbSettles.forEach((item) => {
    if (item.price > max) max = item.price
    if (item.price < min) min = item.price
  })
  max = Math.ceil(max)
  min = Math.floor(min)

  $rangeOne.attr('max', max);
  $rangeOne.attr('min', min);
  $rangeOne.val(min);
  $rangeTwo.attr('max', max);
  $rangeTwo.attr('min', min);
  $rangeTwo.val(max);

  var radioFlag = 0; // 0: settle, 1: ticket, 2: money
  var isReturnMoneyUI = false;
  if (btnMoneyOk.length) {
    radioFlag = 1;
    isReturnMoneyUI = true;
  }

  console.log('UI>>>', isReturnMoneyUI)

  var qFilter = new QueryFilterD(getOptions(local_dbData.settles), filterData);
  var forSelf = local_dbData.forSelf;
  if (forSelf) {
    btnCustomer.hide();
    btnCollection.hide();
  }

  $('#first-th').html('<input id="select-all" type="checkbox" data-toggle="tooltip" data-placement="bottom" title="选择所有记录" />');
  var checkSelectAll = $('#select-all');

  if (isReturnMoneyUI) {
    // $('#filter-ui').toggle();
    filterData(false);
  } else {
    resetTableRow();
  }

  var updateView = function () {
    if ($(this).attr('name') === 'rangeOne') {
      $outputOne.html($(this).val());
      $outputOne.css('left', $(this).val() / $(this).attr('max') * 100 + '%');
    } else {
      $outputTwo.css('left', $(this).val() / $(this).attr('max') * 100 + '%');
      $outputTwo.html($(this).val());
    }

    if (parseInt($rangeOne.val()) > parseInt($rangeTwo.val())) {
      $inclRange.css({
        'width': ($rangeOne.val() - $rangeTwo.val()) / $(this).attr('max') * 100 + '%',
        'left': $rangeTwo.val() / $(this).attr('max') * 100 + '%'
      });
    } else {
      $inclRange.css({
        'width': ($rangeTwo.val() - $rangeOne.val()) / $(this).attr('max') * 100 + '%',
        'left': $rangeOne.val() / $(this).attr('max') * 100 + '%'
      });
    }
  };

  updateView.call($rangeOne);
  updateView.call($rangeTwo);

  function updateData(min, max) {
    // console.log('发送数据:', min);
    // console.log('发送数据:', max);
    visible_settles = qFilter.updateOptions(dbSettles, false, Number(min), Number(max));
    resetTableRow();
  }

  $('input[type="range"]').on('mouseup', function () {
    $(this).blur();
  }).on('mousedown input', function () {
    updateView.call(this);

    var one = $rangeOne.val();
    var two = $rangeTwo.val();
    // 清除之前的定时器
    clearTimeout(timeout);

    // 设置一个新的定时器
    timeout = setTimeout(function () {
      updateData(one, two); // 在延迟后调用发送数据函数
    }, 500); // 设置延迟为 500 毫秒
  });

  var amountTimeout;
  $('#q-amount').on('mousedown input', function () {
    if (amountTimeout) {
      clearTimeout(amountTimeout)
    }
    var val = Number(this.value)
    if (val > 0) {
      amountTimeout = setTimeout(function () {
        updateData(val - 1, val + 1)
      }, 300);
    } else {
      amountTimeout = setTimeout(function () {
        updateData(0, 100000000)
      }, 300);
    }
  })



  elementEventRegister(checkSelectAll, 'click', function () {
    if ($(this).is(":checked")) {
      $('.select-item').prop("checked", true);
      selected_settles = curr_settles;
      tableBody.find("tr").addClass('invoice-highlighted');
    } else {
      $('.select-item').prop("checked", false);
      selected_settles = [];
      tableBody.find("tr").removeClass('invoice-highlighted');
    }
    enableButtons();
  });

  elementEventRegister(btnCustomer, 'click', function () {
    buildToggleButton("CUSTOMER", $(this));
  });

  elementEventRegister(btnCollection, 'click', function () {
    buildToggleButton("COLLECTION", $(this));
  });

  function buildToggleButton(new_action, me) {
    if (action != new_action) {
      if (action === "CUSTOMER") {
        btnCustomer.removeClass("btn-primary");
        btnCustomer.addClass("btn-default");
      } else if (action === "COLLECTION") {
        btnCollection.removeClass("btn-primary");
        btnCollection.addClass("btn-default");
      }
      me.removeClass("btn-default");
      me.addClass("btn-primary");
      action = new_action;
      qFilter.reset(getOptions(local_dbData.settles));

      resetTableRow();
    }
  }

  elementEventRegister(btnTicketOk, 'click', function () {
    var settle = selected_settles[0];
    if (settle.ticket_no === 'NOTNEEDED') {
      ticketNoInput.val('');
      $('#not-need-ticket').iCheck('check');
      $('#need-ticket').iCheck('uncheck')
    } else {
      ticketNoInput.val(settle.ticket_no);
      $('#need-ticket').iCheck('check')
      $('#not-need-ticket').iCheck('uncheck');
    }
    ticketNoDlg.modal({ backdrop: 'static', keyboard: false }).modal('show');
  })

  var isNeedTicket = true;
  elementEventRegister(ticketNeeded, 'ifChecked', function () {
    var val = $(this).val();
    isNeedTicket = val === '0'
    if (!isNeedTicket) {
      ticketNoInput.val('');
    }
    ticketNoInput.prop('disabled', !isNeedTicket);
  })

  elementEventRegister(ticketNoDlgOk, 'click', function () {
    var settle = selected_settles[0];
    if (isNeedTicket) {
      var ticketNo = ticketNoInput.val();
      if (isEmpty(ticketNo)) {
        bootbox.alert('还未输入发票号，请输入！')
        return;
      } else {
        settle.ticket_no = ticketNo.trim();
      }
    } else {
      settle.ticket_no = 'NOTNEEDED';
    }

    settle.ticket_date = new Date();
    settle.ticket_person = local_user.userid;
    settle.status = '已开票';
    ajaxRequestHandle('/settle_ticket', 'POST', [settle], '开票', function () {
      // updateUI([settle]);
      resetTableRow();
      ticketNoDlg.modal('hide');
    });
  })

  elementEventRegister(btnTicketCancel, 'click', function () {
    bootbox.confirm("您是否真的要取消所选择的已开票数据?", function (result) {
      if (result) {
        var settles = [];
        selected_settles.forEach(function (settle) {
          if (settle.status === '已开票') {
            settle.status = '已结算';
            settle.ticket_no = "";
            settle.ticket_date = null;
            settle.ticket_person = "";
            settles.push(settle);
          }
        });

        ajaxRequestHandle('/settle_ticket', 'POST', settles, '开票取消', function () {
          updateUI(settles);
        });
      }
    });
  });

  elementEventRegister(btnSettleDelete, 'click', function () {
    for (var i = 0; i < selected_settles.length; ++i) {
      if (selected_settles[i].status != '已结算') {
        bootbox.alert("选择的结算纪录中存在状态[" + selected_settles[i].status + "], 不能删除!");
        return;
      }
    }

    bootbox.confirm("您是否真的要删除选择的结算数据?", function (result) {
      if (result) {
        ajaxRequestHandle('/delete_settle', 'POST', { allSelected: selected_settles, which: action }, 'no_message', function () {
          var len = dbSettles.length;
          while (len--) {
            var curr = dbSettles[len];
            for (var k = 0; k < selected_settles.length; ++k) {
              if (selected_settles[k].serial_number === curr.serial_number) {
                dbSettles.remove(len);
                selected_settles.remove(k);
                break;
              }
            }
          }

          resetTableRow();
          bootbox.alert("删除成功!");
        });
      }
    });
  });

  elementEventRegister(btnMoneyOk, 'click', function () {
    var allSettles = [];
    selected_settles.forEach(function (data) {
      if (data.settle_type != "车船结算") {
        data.status = '已回款';
        data.return_money_date = new Date();
        data.return_person = local_user.userid;
        allSettles.push(data);
      }
    });

    ajaxRequestHandle('/settle_money', 'POST', allSettles, '回款', function () {
      updateUI(allSettles);
      resetTableRow();
    });
  });

  elementEventRegister(btnMoneyCancel, 'click', function () {
    bootbox.confirm("取消回款: 您是否真的要取消所选择的已回款数据?", function (result) {
      if (result) {
        var settles = [];
        selected_settles.forEach(function (settle) {
          if (settle.status === '已回款') {
            settle.status = '已开票';
            settle.return_person = "";
            settle.return_money_date = null;
            settles.push(settle);
          }
        });

        ajaxRequestHandle('/settle_ticket', 'POST', settles, '回款取消', function () {
          updateUI(settles);
        });
      }
    });
  });

  elementEventRegister(btnShowDetail, 'click', function () {
    var settle = selected_settles[0];
    $('body').css({ 'cursor': 'wait' });
    $.get('/get_settle_bill', { fSerial: settle.serial_number }, function (data) {
      var result = jQuery.parseJSON(data);
      if (result.ok) {
        dbBills = result.bills;
        var html = '';
        var allBills = result.settle_bills;//settle.bills;
        dbBills.forEach(function (bill) {
          allBills.forEach(function (abill) {
            if (String(abill.bill_id) === String(bill._id)) {
              html += makeBillTableBodyTr(bill, settle.settle_type, abill);
            }
          })
        });

        var tbody = $('#settle-bill-tbody');
        tbody.empty();
        tbody.append(html);
        $('[data-toggle="popover"]').popover({ trigger: "hover", html: true, placement: "bottom" });
        $('#settle-detail-dialog').modal({ backdrop: 'static', keyboard: false }).modal('show');
      } else {
        dbBills = [];
      }
      $('body').css({ 'cursor': 'default' });
    });
  });

  elementEventRegister($('#settle-radio'), 'ifChecked', function () { resetFilterAndUI(0); });
  elementEventRegister($('#ticket-radio'), 'ifChecked', function () { resetFilterAndUI(1); });
  elementEventRegister($('#money-radio'), 'ifChecked', function () { resetFilterAndUI(2); });

  elementEventRegister(btnRealPrice, 'click', buildRealPriceInputDialog);

  ////////////////////////////////////////////////////////////////////////////////////////////////////////
  /// function list
  ////////////////////////////////////////////////////////////////////////////////////////////////////////
  function resetFilterAndUI(flag) {
    radioFlag = flag;
    qFilter.reset(getOptions(local_dbData.settles));
    resetTableRow();
  }

  function updateUI(selectedSettles) {
    var len = tableBody.find("tr").length;
    while (len--) {
      var tr = getRowChildren(tableBody, len);
      var sn = getTableCellChildren(tr, 2).text();
      for (var k = 0; k < selectedSettles.length; ++k) {
        if (selectedSettles[k].serial_number === sn) {
          tr.remove();
          break;
        }
      }
    }

    checkSelectAll.prop("checked", selectedSettles.length === tableBody.find("tr").length);
    enableButtons();
  }

  function enableButtons() {
    if (curr_settles.length) {
      setHtmlElementDisabled(btnExport, false);
      setHtmlElementDisabled(btnFilter, false);
    } else {
      setHtmlElementDisabled(btnExport, true);
      setHtmlElementDisabled(btnFilter, true);
    }

    if (selected_settles.length) {
      setHtmlElementDisabled(btnShowDetail, selected_settles.length != 1);
      setHtmlElementDisabled(btnRealPrice, selected_settles.length != 1);

      if (btnMoneyOk.length) {
        var numOfTicket = 0;
        var numOfMoney = 0;
        for (var i = 0; i < selected_settles.length; ++i) {
          if (selected_settles[i].status === '已开票') {
            ++numOfTicket;
          } else if (selected_settles[i].status === '已回款') {
            ++numOfMoney;
          }
        }
        setHtmlElementDisabled(btnMoneyOk, numOfTicket === 0);
        setHtmlElementDisabled(btnMoneyCancel, numOfMoney === 0);
      } else {
        setHtmlElementDisabled(btnSettleDelete, false);
        for (var k = 0; k < selected_settles.length; ++k) {
          if (selected_settles[k].status === '已开票') {
            setHtmlElementDisabled(btnTicketCancel, false);
            break;
          }
        }

        if (selected_settles.length === 1) {
          setHtmlElementDisabled(btnTicketOk, false);
        }
      }
    } else {
      setHtmlElementDisabled(btnShowDetail, true);
      if (btnMoneyOk.length) {
        setHtmlElementDisabled(btnMoneyOk, true);
        setHtmlElementDisabled(btnMoneyCancel, true);
        setHtmlElementDisabled(btnRealPrice, true);
      } else {
        setHtmlElementDisabled(btnTicketOk, true);
        setHtmlElementDisabled(btnTicketCancel, true);
        setHtmlElementDisabled(btnSettleDelete, true);
      }
    }
  }

  function buildTicketNoInputDialog() {
    var settle = selected_settles[0];
    // var msg = '<div class="row form-horizontal"><div class="col-md-10">';
    // var str = '<div class="form-group">' +
    //             '<label for="{0}" class="control-label col-sm-4">开票号</label>' + 
    //             '<div class="input-group col-sm-8"><input id="{1}" type="text" name="{2}" class="form-control"></div></div>';
    // msg += str.format(settle.serial_number, settle.serial_number, settle.serial_number) + '</div></div>';

    var msg = `<div style="padding: 15px;">
<div class="row form-horizontal"><div class="col-md-11">
<div class="form-group">
  <label for="ticket-need" class="control-label col-sm-4" style="padding-top: 12px;">是否开票</label>
  <div class="input-group col-sm-8" style="margin-bottom: 8px;">
    <div style="display: inline-flex">
      <label class="qd-radio-button"><input type="radio" name="ticket-need" value="0" checked><span class="qd-radio"></span>需要开票</label>
      <label class="qd-radio-button"><input type="radio" name="ticket-need" value="1"><span class="qd-radio"></span>不开票</label>
    </div>
  </div>
</div></div></div>
<div class="row form-horizontal"><div class="col-md-11">
<div class="form-group">
  <label for="{0]" class="control-label col-sm-4">开票号码</label>
  <div class="input-group col-sm-8">
    <input id="{1}" type="text" name="{2}" class="form-control" />
  </div>
</div></div></div>
`.format(settle.serial_number, settle.serial_number, settle.serial_number);

    bootbox.dialog({
      message: msg,
      title: "开票:请输入票号",
      buttons: {
        cancel: { label: "取消", className: "btn-default" },
        main: {
          label: "确定", className: "btn-primary",
          callback: function () {
            var id = '#' + settle.serial_number;
            settle.ticket_no = $(id).val();
            settle.ticket_date = new Date();
            settle.ticket_person = local_user.userid;
            settle.status = '已开票';
            ajaxRequestHandle('/settle_ticket', 'POST', [settle], '开票', function () {
              updateUI([settle]);
            });
          }
        }
      }
    });
  }

  function buildRealPriceInputDialog() {
    var settle = selected_settles[0];
    var msg = '<div class="row form-horizontal"><div class="col-md-10">';
    var str = '<div class="form-group"><label for="{0}" class="control-label col-sm-4">实收价格</label><div class="input-group col-sm-8"><input id="{1}" type="text" name="{2}" class="form-control"></div></div>';
    msg += str.format(settle.serial_number, settle.serial_number, settle.serial_number) + '</div></div>';

    bootbox.dialog({
      message: msg,
      title: "请输入实收价格",
      buttons: {
        cancel: { label: "取消", className: "btn-default" },
        main: {
          label: "确定", className: "btn-primary",
          callback: function () {
            var id = '#' + settle.serial_number;
            var p = $(id).val();
            if (p > 0) {
              settle.real_price = p;
              ajaxRequestHandle('/settle_real_price', 'POST', { sno: settle.serial_number, price: p }, '实收价格', function () {
                var len = tableBody.find("tr").length;
                for (var i = 0; i < len; ++i) {
                  var tr = getRowChildren(tableBody, i);
                  var sn = getTableCellChildren(tr, 2).text();
                  if (sn === settle.serial_number) {
                    var s = '';
                    if (p != settle.price) {
                      s = '<code style="color:red;font-weight:bold">' + getStrValue(p) + '</code>';
                    } else {
                      s = '<code style="color:green">' + getStrValue(settle.price) + '</code>';
                    }
                    getTableCellChildren(tr, 6).html(s);
                    break;
                  }
                }
              });
            } else {
              bootbox.alert("无效的价格");
            }
          }
        }
      }
    });
  }

  function resetTableRow() {
    tableBody.empty();
    curr_settles = [];
    selected_settles = [];
    var html_text = [];
    var tn = 0, tw = 0, tp = 0;
    visible_settles.forEach(function (settle) {
      if (
        ((radioFlag === 0 && settle.status === "已结算") ||
          (radioFlag === 1 && settle.status === "已开票") ||
          (radioFlag === 2 && settle.status === "已回款"))) {
        if (!isReturnMoneyUI) {
          if ((action === "CUSTOMER" && settle.settle_type === "客户结算") ||
            (action === "COLLECTION" && settle.settle_type === "代收代付结算")) {
            html_text.push(makeTableBodyTr(settle));
            curr_settles.push(settle);
            tn += settle.ship_number;
            tw += settle.ship_weight;
            tp += settle.price;
          }
        } else {
          html_text.push(makeTableBodyTr(settle));
          curr_settles.push(settle);
          tn += settle.ship_number;
          tw += settle.ship_weight;
          tp += settle.price;
        }
        /*
        if (radioFlag === 0 || radioFlag === 1) {
          if (isReturnMoneyUI) {
          } else {
            if ( (action === "CUSTOMER" && settle.settle_type === "客户结算") || 
                 (action === "COLLECTION" && settle.settle_type === "代收代付结算")) {
              html_text.push(makeTableBodyTr(settle));
              curr_settles.push(settle);
              tn += settle.ship_number;
              tw += settle.ship_weight;
              tp += settle.price;
            }
          }
        } else {
          html_text.push(makeTableBodyTr(settle));
          curr_settles.push(settle);
          tn += settle.ship_number;
          tw += settle.ship_weight;
          tp += settle.price;
        }
        */
      }
    });

    tableBody.append(html_text.join('\n'));

    checkSelectAll.prop("checked", false);
    enableButtons();

    tableBody.find('tr').on('click', function () {
      selectRow($(this), true);
    }).on('dblclick', function () {
      buildTicketNoInputDialog();
    });

    $('.select-item').on('click', function (e) {
      e.stopImmediatePropagation();
      selectRow($(this).closest('tr'), false);
    });

    $('[data-toggle="popover"]').popover({ trigger: "hover", html: true, placement: "bottom" });

    $('.td-icon').on('click', function (e) { // delete button click
      e.stopImmediatePropagation();
      e.preventDefault();
      var tr = $(this).closest('tr');
      var idx = tr.index();
      var selected = curr_settles[idx];
      if (selected.status != '已结算') {
        bootbox.alert("当前选择的结算纪录状态为" + selected.status + ", 不能删除!");
      } else {
        bootbox.confirm("您是否真的要删除此结算数据?", function (result) {
          if (result) {
            ajaxRequestHandle('/delete_settle', 'POST', { allSelected: [selected], which: action }, 'no_message', function () {
              for (var i = 0; i < selected_settles.length; ++i) {
                if (selected_settles[i].serial_number === selected.serial_number) {
                  selected_settles.remove(i);
                  break;
                }
              }
              for (i = 0; i < dbSettles.length; ++i) {
                if (dbSettles[i].serial_number === selected.serial_number) {
                  dbSettles.remove(i);
                  break;
                }
              }

              curr_settles.remove(idx);
              tr.remove();

              $('#curr-settle-num').text(curr_settles.length);
              enableButtons();
              bootbox.alert("删除成功!");
            });
          }
        });
      }
    });

    $('#curr-settle-num').text(curr_settles.length);
    $('#lb-total-num').text(tn);
    $('#lb-total-weight').text(getStrValue(tw));
    $('#lb-total-amount').text(getStrValue(tp));
  }

  function selectRow(me, needUpdateCheckbox) {
    var b = curr_settles[me.index()];
    var found = false;
    for (var i = 0; i < selected_settles.length; ++i) {
      if (selected_settles[i].serial_number === b.serial_number) {
        selected_settles.remove(i);
        found = true;
        break;
      }
    }

    if (found) {
      me.removeClass('invoice-highlighted');
    } else {
      selected_settles.push(b);
      me.addClass('invoice-highlighted');
    }

    if (needUpdateCheckbox) {
      me.find('input[type="checkbox"]').prop("checked", !found);
    }

    checkSelectAll.prop("checked", selected_settles.length === curr_settles.length);
    enableButtons();
  }

  function makeTableBodyTr(row) {
    var status_str = getStrByStatus(row.status, row.status);
    var ticketNo = row.ticket_no;
    if (row.status === '已开票') {
      if (row.ticket_no === 'NOTNEEDED') {
        status_str = '<code style="color:blue">不需要开票</code>';
        ticketNo = '不需要'
      }
    }

    var str = '<tr data-toggle="popover" title="" data-content=""><td align="center"><input type="checkbox" class="select-item" /></td>';

    var s = '';
    if (isExist(row.real_price) && row.real_price != 0 && row.real_price != row.price) {
      s = '<code style="color:red;font-weight:bold">' + getStrValue(row.real_price) + '</code>';
    } else {
      s = '<code style="color:green">' + getStrValue(row.price) + '</code>';
    }

    str += `<td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td>
  <td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td>
  <td style="white-space: pre-wrap;word-wrap: break-word;max-width:220px;min-width:50px">{11}</td>
  <td align="center" style="cursor:pointer" class="td-icon"><i title="删除" class="fa fa-trash-o redlink"></i></td></tr>`;
    return str.format(status_str, row.serial_number, row.settle_type, row.billing_name,
      getStrValue(row.price), s, row.ship_number, getStrValue(row.ship_weight),
      isEmpty(row.settle_date) ? '' : moment(row.settle_date).format("YYYY-MM-DD"),
      row.settler ? row.settler : '',
      isEmpty(row.ticket_date) ? '' : moment(row.ticket_date).format("YYYY-MM-DD"),
      ticketNo ? ticketNo : ''
    );
  }

  function makeBillTableBodyTr(bill, settle_type, settle_bill) {
    var statusStr = "";
    if (bill.status === '已结算') {
      var statusText = [];
      if ((bill.settle_flag & CUSTOMER_SETTLE_FLAG) === CUSTOMER_SETTLE_FLAG) {
        statusText.push("客户");
      }
      if ((bill.settle_flag & COLLECTION_SETTLE_FLAG) === COLLECTION_SETTLE_FLAG) {
        statusText.push("代收付");
      }
      statusStr = getStrByStatus(statusText.join(',') + '已结算', bill.status);
    } else {
      statusStr = getStrByStatus(bill.status, bill.status);
    }
    var priceInfoObj = getInvoicePriceInfo(bill);
    var tip = getBillTooltip(bill, priceInfoObj.totalCustomerPrice, priceInfoObj.totalVehPrice);
    var vessel, priceText;
    var shipTo = '';
    for (var i = 0; i < bill.invoices.length; ++i) {
      var inv = bill.invoices[i];
      if (inv.inv_no === settle_bill.inv_no) {
        if (settle_type === "客户结算") {
          vessel = inv.veh_ves_name;
          priceText = getStrValue(inv.price);
        } else if (settle_type === "代收代付结算") {
          vessel = "";
          priceText = getStrValue(bill.collection_price);
        }
        shipTo = inv.ship_to;
        break;
      }
    }

    var guige = getStrValue(bill.thickness) + '*' + getStrValue(bill.width) + '*' + bill.len;

    var trHtml = '<tr {0}><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td><td>{11}</td><td>{12}</td></tr>';
    return trHtml.format(tip, statusStr, getOrder(bill.order_no, bill.order_item_no), bill.bill_no, guige,
      bill.billing_name, vessel, shipTo, priceText, settle_bill.num, getStrValue(settle_bill.weight),
      getStrValue(priceText * settle_bill.weight), date2Str(bill.shipping_date));
  }

  function getBillTooltip(bill, customerPrice, vehPrice) {
    var t = bill.order + ' ' + bill.bill_no;
    var tip = 'data-toggle="popover" title="' + t + '" data-content="客户价格: {0}<br />车船价格: {1}<br />代收代付价格: {2}<br />' +
      '厚度: {3}<br />宽度: {4}<br />长度: {5}<br />尺寸: {6}<br />牌号: {7}<br />销售部门: {8}<br />发货仓库: {9}<br />合同号: {10}<br />"';
    return tip.format(getStrValue(customerPrice), getStrValue(vehPrice), getStrValue(bill.collection_price * bill.total_weight),
      getStrValue(bill.thickness), getStrValue(bill.width),
      getStrValue(bill.len), bill.size_type ? bill.size_type : '', bill.brand_no ? bill.brand_no : '',
      bill.sales_dep ? bill.sales_dep : '', bill.ship_warehouse ? bill.ship_warehouse : '',
      bill.contract_no ? bill.contract_no : '');
  }

  /////////////////////////////////////////////////////////////////////////////
  // Export & Filter function
  elementEventRegister(btnExport, 'click', function () {
    if (selected_settles.length > 0) {
      var settle = selected_settles[0];
      $.get('/get_settle_bill', { fSerial: settle.serial_number }, function (data) {
        var result = jQuery.parseJSON(data);
        if (result.ok) {
          dbBills = result.bills;
          var html = '';
          var allBills = result.settle_bills;//settle.bills;
          dbBills.forEach(function (bill) {
            allBills.forEach(function (abill) {
              if (String(abill.bill_id) === String(bill._id)) {
                html += makeBillTableBodyTr(bill, settle.settle_type, abill);
              }
            })
          });

          var tbody = $('#settle-bill-tbody');
          tbody.empty();
          tbody.append(html);
          tableToExcel($('#table-content').html(), "data");
        }
      })
    } else {
      bootbox.alert('请选择要导出的结算记录');
    }
  });


  elementEventRegister(btnFilter, 'click', function () { $('#filter-ui').toggle() });

  function getOptions(dbData) {
    var settles = dbData;
    var nOptions = { serials: [], destList: [], nameList: [] };

    if (btnMoneyOk.length) {
      settles.forEach(function (settle) {
        if ((radioFlag === 1 && settle.status === "已开票") || (radioFlag === 2 && settle.status === "已回款")) {
          if (nOptions.nameList.indexOf(settle.billing_name) < 0) {
            nOptions.nameList.push(settle.billing_name);
          }
          if (nOptions.serials.indexOf(settle.serial_number) < 0) {
            nOptions.serials.push(settle.serial_number);
          }
          if (nOptions.destList.indexOf(settle.ship_to) < 0) {
            nOptions.destList.push(settle.ship_to);
          }
        }
      })
    } else {
      settles.forEach(function (settle) {
        if (((radioFlag === 1 && settle.status === "已开票") ||
          (radioFlag === 0 && settle.status === "已结算")) &&
          ((action === 'CUSTOMER' && settle.settle_type === '客户结算') ||
            (action === 'COLLECTION' && settle.settle_type === '代收代付结算'))) {

          if (nOptions.nameList.indexOf(settle.billing_name) < 0) {
            nOptions.nameList.push(settle.billing_name);
          }
          if (nOptions.serials.indexOf(settle.serial_number) < 0) {
            nOptions.serials.push(settle.serial_number);
          }
          if (nOptions.destList.indexOf(settle.ship_to) < 0) {
            nOptions.destList.push(settle.ship_to);
          }
        }
      })
    }

    nOptions.serials.sort();
    nOptions.destList = sort_pinyin(nOptions.destList);
    nOptions.nameList = sort_pinyin(nOptions.nameList);
    return nOptions;
  }

  function filterData(reset) {
    visible_settles = qFilter.updateOptions(dbSettles, reset);
    resetTableRow();
  }
});

////////////////////////////////////////////////////////////////////////
function QueryFilterD(options, filter) {
  this.currSelected = 0;
  var self = this;

  this.uiElems = {
    sBfBillName: $('#bf-bill-name'),
    sBfSerialNumber: $('#bf-serial-number'),
    sBfDest: $('#bf-destination'),
    startDateGrp: $('#start-date-grp'),
    endDateGrp: $('#end-date-grp'),
    iStartDate: $('#start-date'),
    iEndDate: $('#end-date'),
    lblAmountRange: $('#amount-range'),
    iAmount: $('#q-amount'),
    iAmountRange: $('#q-amount-range')
  };

  this.options = options;
  this.eDate = moment();
  this.sDate = moment().subtract(3, 'months');

  initSelect(this.uiElems.sBfBillName, options.nameList, true);
  initSelect(this.uiElems.sBfSerialNumber, options.serials, true);
  initSelect(this.uiElems.sBfDest, options.destList, true);
  this.uiElems.sBfBillName.select2();
  this.uiElems.sBfSerialNumber.select2();
  this.uiElems.sBfDest.select2();

  //this.uiElems.iStartDate.val("");
  //this.uiElems.iEndDate.val("");
  var startGrp = self.uiElems.startDateGrp.datetimepicker(getDateTimePickerOptions());
  var endGrp = self.uiElems.endDateGrp.datetimepicker(getDateTimePickerOptions());
  this.uiElems.endDateGrp.data("DateTimePicker").setDate(this.eDate);
  this.uiElems.startDateGrp.data("DateTimePicker").setDate(this.sDate);

  // 设置只能查询一年以内的数据
  setDateGrpMinMaxRange(this.uiElems.startDateGrp, this.uiElems.endDateGrp);

  this._selectFliterFunc = function (which, filter) {
    this.currSelected = which;
    if (this.isAllEmpty()) {
      filter(true);       // return to initial state
    }
    else {
      filter(false);
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
      filter(false);
    }
  };

  self.uiElems.sBfBillName.on('change', function () { self._selectFliterFunc(1, filter); });
  self.uiElems.sBfSerialNumber.on('change', function () { self._selectFliterFunc(2, filter); });
  self.uiElems.sBfDest.on('change', function () { self._selectFliterFunc(4, filter); });

  self.uiElems.lblAmountRange.on('click', function () {
    self.uiElems.iAmount.toggle();
    self.uiElems.iAmountRange.toggle();
  })

  startGrp.on('dp.change', function (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    self.sDate = e.date.startOf('day');
    self.uiElems.endDateGrp.data("DateTimePicker").setMinDate(e.date);
    self._dateFilterFunc(true, true, filter);
  });
  endGrp.on('dp.change', function (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    self.eDate = e.date.endOf('day');
    self.uiElems.startDateGrp.data("DateTimePicker").setMaxDate(e.date);
    self._dateFilterFunc(true, true, filter);
  });
  self.uiElems.iStartDate.on('change', function (e) {
    e.stopImmediatePropagation();
    self._dateFilterFunc(true, false, filter);
  });
  self.uiElems.iEndDate.on('change', function (e) {
    e.stopImmediatePropagation();
    self._dateFilterFunc(false, true, filter);
  });
}

QueryFilterD.prototype.isAllEmpty = function () {
  var serial = getSelectValue(this.uiElems.sBfSerialNumber);
  var dest = getSelectValue(this.uiElems.sBfDest);
  var name = getSelectValue(this.uiElems.sBfBillName);
  var d1 = this.uiElems.iStartDate.val();
  var d2 = this.uiElems.iEndDate.val();
  return isEmpty(serial) && isEmpty(dest) && isEmpty(name) && isEmpty(d1) && isEmpty(d2);
};

QueryFilterD.prototype.updateOptions = function (settles, reset, min = null, max = null) {
  var serial = getSelectValue(this.uiElems.sBfSerialNumber);
  var dest = getSelectValue(this.uiElems.sBfDest);
  var name = getSelectValue(this.uiElems.sBfBillName);

  var nOptions = { serials: [], destList: [], nameList: [] };
  var visible = [];
  if (reset) {
    initSelect(this.uiElems.sBfBillName, this.options.nameList, true);
    initSelect(this.uiElems.sBfSerialNumber, this.options.serials, true);
    initSelect(this.uiElems.sBfDest, this.options.destList, true);
    visible = settles;
  } else {
    var d1 = this.uiElems.iStartDate.val();
    var d2 = this.uiElems.iEndDate.val();
    var dateNotEmpty = !isEmpty(d1) && !isEmpty(d2);
    if (dateNotEmpty) {
      d1 = moment(d1).startOf('day').format('YYYY-MM-DD HH:mm:ss')
      d2 = moment(d2).endOf('day').format('YYYY-MM-DD HH:mm:ss')
    }

    settles.forEach(function (settle) {
      var b1 = !serial || serial === settle.serial_number;
      var b3 = !dest || dest === settle.ship_to;
      var b4 = !name || name === settle.billing_name;
      var sd = moment(settle.settle_date);
      var priceInRange = true
      if (min && max) {
        if (min < max) {
          priceInRange = settle.price >= min && settle.price <= max
        } else {
          priceInRange = settle.price >= max && settle.price <= min
        }
      }

      if (b1 && b3 && b4 && (!dateNotEmpty || (sd.isAfter(d1, 'minute') && sd.isBefore(d2, 'minute'))) && priceInRange) {
        if (nOptions.serials.indexOf(settle.serial_number) < 0) {
          nOptions.serials.push(settle.serial_number);
        }
        if (nOptions.destList.indexOf(settle.ship_to) < 0) {
          nOptions.destList.push(settle.ship_to);
        }
        visible.push(settle);
      }
    });

    nOptions.serials.sort();
    nOptions.destList = sort_pinyin(nOptions.destList);
    nOptions.nameList = sort_pinyin(nOptions.nameList);

    if (this.currSelected === 2) {
      initSelect(this.uiElems.sBfDest, nOptions.destList, true, dest);
    }
    else if (this.currSelected === 3) {
      initSelect(this.uiElems.sBfDest, nOptions.destList, true, dest);
      initSelect(this.uiElems.sBfSerialNumber, nOptions.serials, true, serial);
    }
    else if (this.currSelected === 4) {
      initSelect(this.uiElems.sBfSerialNumber, nOptions.serials, true, serial);
    }
    else {
      initSelect(this.uiElems.sBfSerialNumber, nOptions.serials, true, serial);
      initSelect(this.uiElems.sBfDest, nOptions.destList, true, dest);
    }
  }

  return visible;
};

QueryFilterD.prototype.reset = function (options) {
  this.options = options;
  initSelect(this.uiElems.sBfBillName, this.options.nameList, true);
  initSelect(this.uiElems.sBfSerialNumber, this.options.serials, true);
  initSelect(this.uiElems.sBfDest, this.options.destList, true);
};
