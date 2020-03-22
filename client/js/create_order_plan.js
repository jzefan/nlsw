$(function () {
  "use strict";

  var iOrderNo       = $('#order-no');
  var iOrderWeight   = $('#order-weight');
  var sCustomerName  = $('#customer-name');
  var iCustomerCode  = $('#customer-code');
  var sDestination   = $('#destination');
  var sTransportMode = $('#transport-mode');
  var iConsignee     = $('#consignee');
  var iDsClient      = $('#ds-client');
  var iContractNo    = $('#contract-no');
  var iCustomerSaleman = $('#customer-saleman');
  var iReceivingCharge = $('#receiving-charge');
  var iConsigner     = $('#consigner');
  var inputTbody     = $('#input-plan-content');
  var iInputDate     = $('#order-input-grp');

  var allOrders = [];

  iInputDate.datetimepicker(getDateTimePickerOptions());
  sCustomerName.select2();
  sDestination.select2();

  function initInputUIValues() {
    iOrderNo.val('');
    iOrderWeight.val('');
    sCustomerName.select2('val', '');
    iCustomerCode.val('');
    sDestination.select2('val', '');
    sTransportMode.val('船运');
    iConsignee.val('');
    iDsClient.val('');
    iContractNo.val('');
    iCustomerSaleman.val('');
    iReceivingCharge.val('');
    iConsigner.val('');
    unselected(sCustomerName);
    unselected(sDestination);
    inputTbody.empty();
    allOrders = [];
    if (iInputDate.length) {
      iInputDate.data("DateTimePicker").setDate('');
    }
  }

  initInputUIValues();

  iOrderWeight.ForceNumericOnly();
  iReceivingCharge.ForceNumericOnly();

  elementEventRegister(iOrderNo, "blur", function () {
    var me = $(this);
    var order_no = me.val();
    if (order_no.length != 11) {
      bootbox.alert('当前输入的订单号的长度是' + order_no.length + '位，长度必须为11位');
    } else {
      $.get('/order_plan_exist', {q: order_no}, function (data) {
        var obj = jQuery.parseJSON(data);
        if (obj.exist) {
          bootbox.alert('此订单号已经存在: ' + order_no);
          me.val('');
        }
      })
    }
  });

  elementEventRegister($('#ui_input_save'), "click", function () {
    if (allOrders.length) {
      ajaxRequestHandle('/create_order_plan', 'POST', allOrders, '数据保存', function() {
        initInputUIValues();
      });
    } else {
      bootbox.alert("没有数据, 请输入");
    }
  });

  elementEventRegister($('#add-one'), 'click', function() {
    var orderNo = iOrderNo.val();
    var orderWeight = iOrderWeight.val();
    var customerName = sCustomerName.val();
    var inputDate = iInputDate.data("DateTimePicker").getDate();
    if (isEmpty(orderNo)) {
      bootbox.alert('请输入订单号');
    } else if (orderNo.length != 11) {
      bootbox.alert('订单号的长度必须是11位, 当前输入长度为：' + orderNo.length);
    } else if (isEmpty(orderWeight)) {
      bootbox.alert('请输入订单量');
    } else if (isEmpty(customerName)) {
      bootbox.alert('请输入客户名称');
    } else if (isEmpty(inputDate)) {
      bootbox.alert('请输入录单时间');
    } else {
      var isOk = true;
      for (var i = 0; i < allOrders.length; ++i) {
        if (allOrders[i].orderNo === orderNo) {
          bootbox.alert('不唯一, 订单号相同');
          isOk = false;
          break;
        }
      }

      if (isOk) {
        allOrders.push({
          orderNo: orderNo,
          orderWeight : orderWeight,
          leftWeight: orderWeight,
          customerName : customerName,
          entryTime : inputDate,
          customerCode : isEmpty(iCustomerCode.val()) ? '' : iCustomerCode.val(),
          destination : isEmpty(sDestination.val()) ? '' : sDestination.val(),
          transportMode : isEmpty(sTransportMode.val()) ? '' : sTransportMode.val(),
          consignee : isEmpty(iConsignee.val()) ? '' : iConsignee.val(),
          dsClient : isEmpty(iDsClient.val()) ? '' : iDsClient.val(),
          contractNo : isEmpty(iContractNo.val()) ? '' : iContractNo.val(),
          salesman : isEmpty(iCustomerSaleman.val()) ? '' : iCustomerSaleman.val(),
          receivingCharge : isEmpty(iReceivingCharge.val()) ? '' : iReceivingCharge.val(),
          consigner : isEmpty(iConsigner.val()) ? '' : iConsigner.val(),
        });

        var html = "";
        allOrders.forEach(function(order) {
          html += makeTableBodyTr(order);
        });
        inputTbody.html(html);

        $('.redlink').on('click', function (e) {
          e.stopImmediatePropagation();
          var tr = $(this).closest('tr');
          allOrders.remove(tr.index());
          tr.remove();
        });
      }
    }
  });

  function makeTableBodyTr(order) {
    var str = '<tr><td style="cursor:pointer" class="td-icon"><i title="删除" class="fa fa-trash-o redlink"></i></td>';
    for (var i = 0; i < 13; ++i) {
      str += "<td>{" + i + "}</td>";
    }
    str += "</tr>";

    return str.format(order.orderNo, getStrValue(order.orderWeight), order.customerName,
      order.customerCode ? order.customerCode : '',
      order.destination ? order.destination : '',
      order.transportMode,
      order.consignee ? order.consignee : '',
      order.dsClient ? order.dsClient : '',
      order.salesman ? order.salesman : '',
      order.consigner ? order.consigner : '',
      order.contractNo ? order.contractNo : '',
      getStrValue(order.receivingCharge),
      date2Str(order.entryTime));
  }
});