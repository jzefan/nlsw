$(function () {
  "use strict";

  var tableBody  = $('#table-tbody');
  var btnFilter  = $('#filter');
  var btnExport  = $('#search-export');

  var updatePlan = $('#plan-update');
  var deletePlan = $('#plan-delete');
  var closePlan = $('#plan-end');
  var unClosePlan = $('#undo-plan-end');
  var destination = $('#m_destination');

  var dbPlans = [];
  var selectedPlans = [];
  var selectedIdx = 0;

  var qFilter = new PlanQueryFilterD(local_data.customer_name, filterData);
  destination.select2();
  initSelect(destination, local_data.destination, false, '');

  $('#first-th').html('<input id="select-all" type="checkbox" data-toggle="tooltip" data-placement="bottom" title="选择所有记录" />');
  enableButtons();

  elementEventRegister(updatePlan, 'click', function() {
    showUpdateForm();
  });

  elementEventRegister(deletePlan, 'click', function() {
    if (selectedPlans.length) {
      bootbox.confirm('危险!您确定要删除? 删除后不能恢复!', function (result) {
        if (result) {
          ajaxRequestHandle('/plan/delete', 'POST', selectedPlans, '删除', function () {
            selectedPlans.forEach( function(p) {
              for (var k = 0; k < dbPlans.length; ++k) {
                if (p.order_no === dbPlans[k].order_no) {
                  dbPlans.splice(k, 1);
                  break;
                }
              }
            });
            resetTableRow();
          });
        }
      });
    }
  });

  elementEventRegister(closePlan, 'click', function() {
    var ordersNo = [];
    selectedPlans.forEach(function (plan) { ordersNo.push(plan.order_no); });
    ajaxRequestHandle('/plan/status_close', 'POST', ordersNo, '订单终结', function() {
      selectedPlans.forEach(function (p) {
        for (var k = 0; k < dbPlans.length; ++k) {
          if (p.order_no === dbPlans[k].order_no) {
            var tr = getRowChildren(tableBody, k);
            tr.find("td").eq(16).html('订单终结');
            break;
          }
        }
      });
    })
  });

  elementEventRegister(unClosePlan, 'click', function() {
    var ordersNo = [];
    selectedPlans.forEach(function (plan) { ordersNo.push(plan.order_no); });
    ajaxRequestHandle('/plan/status_unclose', 'POST', ordersNo, '取消订单终结', function() {
      selectedPlans.forEach(function (p) {
        for (var k = 0; k < dbPlans.length; ++k) {
          if (p.order_no === dbPlans[k].order_no) {
            var tr = getRowChildren(tableBody, k);
            if (p.left_weight == p.order_weight) {
              tr.find("td").eq(16).html('未发运');
            } else if (p.left_weight == 0) {
              tr.find("td").eq(16).html('发运完');
            } else {
              tr.find("td").eq(16).html('发运中');
            }
            break;
          }
        }
      });
    })
  });

  elementEventRegister($('#select-all'), 'click', function() {
    if (dbPlans.length > 0) {
      var checkBox = $('.select-order');
      if (selectedPlans.length === dbPlans.length) { // 之前已经选择
        checkBox.prop("checked", false);
        selectedPlans = [];
        tableBody.find("tr").removeClass('invoice-highlighted');
      } else {
        checkBox.prop("checked", true);
        selectedPlans = dbPlans.slice(0);
        tableBody.find("tr").addClass('invoice-highlighted');
      }

      enableButtons();
      showSelectedTotalValue();
    }
  });

  elementEventRegister($('#update-plan-ok'), 'click', function() {
    var plan = selectedPlans[0]; //
    var obj = {
      orderNo: plan.order_no,
      orderWeight : $('#m_order_weight').val(),
      destination : $('#m_destination').val(),
      transportMode : $('#m_transport_mode').val(),
      consignee : $('#m_consignee').val(),
      dsClient : $('#m_ds_client').val(),
      salesman : $('#m_salesman').val(),
      consigner : $('#m_consigner').val(),
      contractNo : $('#m_contract_no').val(),
      charge : $('#m_charge').val()
    };

    ajaxRequestHandle('/plan/update', 'POST', obj, '订单更新', function() {
      var tr = getRowChildren(tableBody, selectedIdx);
      tr.find("td").eq(2).html(getStrValue(obj.orderWeight));
      tr.find("td").eq(7).html(obj.destination); // 7 destination
      tr.find("td").eq(8).html(obj.transportMode); // 8 transport mode
      tr.find("td").eq(9).html(obj.consignee ? obj.consignee : ''); // 9 收货人
      tr.find("td").eq(10).html(obj.dsClient ? obj.dsClient : ''); // 10 ds client
      tr.find("td").eq(11).html(obj.salesman ? obj.salesman : ''); // 11 saleman
      tr.find("td").eq(12).html(obj.consigner ? obj.consigner : ''); // 12 consigner
      tr.find("td").eq(13).html(obj.contractNo ? obj.contractNo : ''); // 13 contract no
      tr.find("td").eq(14).html(getStrValue(obj.charge)); // 14 charge

      plan.order_weight = obj.orderWeight;
      plan.destination = obj.destination;
      plan.transport_mode = obj.transportMode;
      plan.consignee = obj.consignee;
      plan.ds_client = obj.dsClient;
      plan.customer_saleman = obj.salesman;
      plan.consigner = obj.consigner;
      plan.contract_no = obj.contractNo;
      plan.receiving_charge = obj.charge;

      $('#plan-modify-dialog').modal('hide');
    });
  });

  ////////////////////////////////////////////////////////////////////////////////////////////////////////
  /// Function list
  ////////////////////////////////////////////////////////////////////////////////////////////////////////
  function enableButtons() {
    if (dbPlans.length) {
      setHtmlElementDisabled(btnExport, false);
    } else {
      setHtmlElementDisabled(btnExport, true);
    }

    if (selectedPlans.length) {
      if (selectedPlans.length === 1) {
        setHtmlElementDisabled(updatePlan, false);
      } else {
        setHtmlElementDisabled(updatePlan, true);
      }
      setHtmlElementDisabled(deletePlan, false);
      setHtmlElementDisabled(closePlan, false);
      setHtmlElementDisabled(unClosePlan, false);
    } else {
      setHtmlElementDisabled(updatePlan, true);
      setHtmlElementDisabled(deletePlan, true);
      setHtmlElementDisabled(closePlan, true);
      setHtmlElementDisabled(unClosePlan, true);
    }
  }

  function showUpdateForm() {
    var plan = selectedPlans[0];
    $('#h_order_no').text(plan.order_no);
    $('#h_order_weight').text(plan.order_weight);
    $('#h_left_weight').text(plan.left_weight);
    $('#h_customer_name').text(plan.customer_name);
    $('#h_customer_code').text(plan.customer_code);
    $('#h_destination').text(plan.destination);
    $('#h_transport_mode').text(plan.transport_mode);
    $('#h_consignee').text(plan.consignee);
    $('#h_ds_client').text(plan.ds_client);
    $('#h_salesman').text(plan.customer_saleman);
    $('#h_consigner').text(plan.consigner);
    $('#h_contract_no').text(plan.contract_no);
    $('#h_charge').text(plan.receiving_charge);
    $('#h_entry_time').text(plan.entry_time);
    $('#h_status').text(getStrStatus(plan.status));

    $('#m_order_weight').val(plan.order_weight);
    $('#m_destination').val(plan.destination);
    $('#m_transport_mode').val(plan.transport_mode);
    $('#m_consignee').val(plan.consignee);
    $('#m_ds_client').val(plan.ds_client);
    $('#m_salesman').val(plan.customer_saleman);
    $('#m_consigner').val(plan.consigner);
    $('#m_contract_no').val(plan.contract_no);
    $('#m_charge').val(plan.receiving_charge);

    $('#plan-modify-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
  }

  function resetTableRow() {
    tableBody.empty();

    selectedPlans = [];
    var html_text = [];
    dbPlans.forEach(function (plan) {
      html_text.push(makeTableBodyTr(plan));
    });

    tableBody.append(html_text.join('\n'));

    $('#select-all').prop("checked", false);
    enableButtons();

    tableBody.find('tr').on('click', function () {
      selectRow($(this), true);
    });

    $('.select-order').on('click', function(e) {
      e.stopImmediatePropagation();
      selectRow($(this).closest('tr'), false);
    });
  }

  function selectRow(me, needUpdateCheckbox) {
    selectedIdx = me.index();
    var b = dbPlans[me.index()];
    var found = false;
    for (var i = 0; i < selectedPlans.length; ++i) {
      if (selectedPlans[i].order_no === b.order_no) {
        selectedPlans.remove(i);
        found = true;
        break;
      }
    }

    if (found) {
      me.removeClass('invoice-highlighted');
    } else {
      selectedPlans.push(b);
      me.addClass('invoice-highlighted');
    }

    if (needUpdateCheckbox) {
      me.find('input[type="checkbox"]').prop("checked", !found);
    }

    $('#select-all').prop("checked", selectedPlans.length === tableBody.find("tr").length);
    enableButtons();
    showSelectedTotalValue();
  }

  function showSelectedTotalValue() {
  }

  function getStrStatus(state) {
    var status = '未发运';
    if (state == 1) {
      status = '发运中';
    } else if (state == 2) {
      status = '发运完';
    } else if (state == 3) {
      status = '发运终结';
    }
    return status;
  }

  function trData(plan, tr) {
    return tr.format(
      plan.order_no,
      getStrValue(plan.order_weight), getStrValue(plan.order_weight - plan.left_weight), getStrValue(plan.left_weight),
      plan.customer_name,
      plan.customer_code ? plan.customer_code : '',
      plan.destination, plan.transport_mode,
      plan.consignee ? plan.consignee : '',
      plan.ds_client ? plan.ds_client : '',
      plan.customer_saleman ? plan.customer_saleman : '',
      plan.consigner ? plan.consigner : '',
      plan.contract_no ? plan.contract_no : '',
      getStrValue(plan.receiving_charge),
      date2Str(plan.entry_time), getStrStatus(plan.status));
  }

  function makeTableBodyTr(plan) {
    var trHtml = '<tr><td align="center"><input class="select-order" type="checkbox"></td>' +
      '<td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td>' +
      '<td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td><td>{11}</td><td>{12}</td><td>{13}</td><td>{14}</td><td>{15}</td></tr>';
    return trData(plan, trHtml);
  }

  elementEventRegister(btnExport, 'click', function() {
    var html_text = [ '<thead><tr><th>订单号</th><th>订单量</th><th>已发量</th><th>未发量</th><th>客户名称</th><th>客户代码</th><th>发运目的地</th><th>运输方式</th><th>收货人</th><th>下游客户</th><th>客户业务员</th><th>业务员</th><th>合同号</th><th>接单价</th><th>录单时间</th><th>订单状态</th></tr></thead><tbody>' ];
    var trHtml = '<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td>' +
      '<td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td><td>{11}</td><td>{12}</td><td>{13}</td><td>{14}</td><td>{15}</td></tr>';
    dbPlans.forEach(function (plan) {
      html_text.push(trData(plan, trHtml));
    });
    html_text.push('</tbody>');

    tableToExcel(html_text.join('\n'), 'data');
  });

  var showFilter = false;
  elementEventRegister(btnFilter, 'click', function() {
    $('#filter-ui').toggle();
    showFilter = !showFilter;
  });

  elementEventRegister($('#show-data'), 'click', function() {
    resetTableRow();
  });

  function filterData(needUpdateDbData, emptyDbData) {
    if (needUpdateDbData) {
      $('body').css({'cursor':'wait'});
      var obj = qFilter.getQueryParams();
      $.get('/search_plans', obj, function (data) {
        var result = jQuery.parseJSON(data);
        dbPlans = [];
        if (result.ok) {
          dbPlans = result.plans;
          $('#lb-total-weight').text(getStrValue(result.totalWeight));
        } else {
          $('#lb-total-weight').text('0.00');
        }

        $('#curr-plans-number').text(dbPlans.length);
        $('body').css({'cursor':'default'});
      });
    } else {
      if (emptyDbData) {
        dbPlans = [];
        $('#lb-total-weight').text('0.00');
        $('#curr-plans-number').text(dbPlans.length);
      }
    }
  }
});

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
var PlanQueryFilterD = function(options, filter) {
  this.currSelected = 0;
  var self = this;

  this.uiElems = {
    sBfOrder : $('#order-no'),
    sBfCustomerName :  $('#customer-name'),
    sBfTransportMode : $('#transport-mode'),
    sBfStatus :    $('#status'),
    startDateGrp : $('#start-date-grp'),
    endDateGrp :   $('#end-date-grp'),
    iStartDate :   $('#start-date'),
    iEndDate :     $('#end-date')
  };

  this.options = options;
  this.uiElems.sBfCustomerName.select2();
  initSelect(this.uiElems.sBfCustomerName, options, true, '');

  this.uiElems.sBfOrder.on('blur', function() { self._selectFliterFunc(1, filter); });
  this.uiElems.sBfCustomerName.on('change', function() { self._selectFliterFunc(1, filter); });
  this.uiElems.sBfTransportMode.on('change', function() { self._selectFliterFunc(1, filter); });
  this.uiElems.sBfStatus.on('change', function() { self._selectFliterFunc(1, filter); });
  unselected(this.uiElems.sBfCustomerName);
  unselected(this.uiElems.sBfTransportMode);
  unselected(this.uiElems.sBfStatus);

  this.eDate = moment();
  this.sDate = moment().subtract(1, 'months');
  var startGrp = self.uiElems.startDateGrp.datetimepicker(getDateTimePickerOptions());
  var endGrp = self.uiElems.endDateGrp.datetimepicker(getDateTimePickerOptions());
  this.uiElems.endDateGrp.data("DateTimePicker").setDate(this.eDate);
  this.uiElems.startDateGrp.data("DateTimePicker").setDate(this.sDate);

  this._selectFliterFunc = function(which, filter) {
    this.currSelected = which;
    if (this.isAllEmpty()) {
      filter(false, true);       // return to initial state
    }
    else {
      filter(true, false);
    }
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

  startGrp.on('dp.change', function(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    self.sDate = e.date.startOf('day');
    self.uiElems.endDateGrp.data("DateTimePicker").setMinDate(e.date);
    self._dateFilterFunc(true, true, filter);
  });
  endGrp.on('dp.change', function(e) {
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

PlanQueryFilterD.prototype.getQueryParams = function() {
  var order = this.uiElems.sBfOrder.val();
  var name = this.uiElems.sBfCustomerName.val();
  var mode = this.uiElems.sBfTransportMode.val();
  var status = this.uiElems.sBfStatus.val();
  var d1 = this.uiElems.iStartDate.val();
  var d2 = this.uiElems.iEndDate.val();
  var b = !isEmpty(d1) && !isEmpty(d2);

  return {
    fOrder: isEmpty(order) ? null : order,
    fName: isEmpty(name) ? null : name,
    fTransportMode: isEmpty(mode) ? null : mode,
    fStatus: isEmpty(status) ? null : status,
    fDate1: b ? this.sDate.toISOString() : null,
    fDate2: b ? this.eDate.toISOString() : null
  };
};

PlanQueryFilterD.prototype.isAllEmpty = function() {
  var order = this.uiElems.sBfOrder.val();
  var name = getSelectValue(this.uiElems.sBfCustomerName);
  var transportMode = this.uiElems.sBfTransportMode.val();
  var status = this.uiElems.sBfStatus.val();
  var d1 = this.uiElems.iStartDate.val();
  var d2 = this.uiElems.iEndDate.val();

  return isEmpty(order) && isEmpty(transportMode) && isEmpty(status) &&
    isEmpty(name) && isEmpty(d1) && isEmpty(d2);
};

PlanQueryFilterD.prototype.reset = function() {
  this.uiElems.sBfCustomerName.select2('val', '');
  this.uiElems.sBfOrder.val('');
  this.uiElems.sBfTransportMode.val('');
  this.uiElems.sBfStatus.val('');
  this.uiElems.iStartDate.val('');
  this.uiElems.iEndDate.val('');
};