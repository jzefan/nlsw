$(function () {
  "use strict";

  const dataDict     = local_data;
  let iOrderNo       = $('#order-no');
  let iOrderWeight   = $('#order-weight');
  let sCustomerName  = $('#customer-name');
  let iCustomerCode  = $('#customer-code');
  let sDestination   = $('#destination');
  let sTransportMode = $('#transport-mode');
  let iConsignee     = $('#consignee');
  let iDsClient      = $('#ds-client');
  let iContractNo    = $('#contract-no');
  let iCustomerSaleman = $('#customer-saleman');
  let iReceivingCharge = $('#receiving-charge');
  let iConsigner     = $('#consigner');
  let inputTbody     = $('#input-order-content');

  let allOrders = [];

  sCustomerName.select2();
  sDestination.select2('val', '');

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
  }

  initInputUIValues();

  iOrderWeight.ForceNumericOnly();
  iReceivingCharge.ForceNumericOnly();

  elementEventRegister(iOrderNo, "blur", function () {
    var me = $(this);
    var order_no = me.val();
    if (order_no.length != 11) {
      bootbox.alert('当前输入的订单号的长度是' + order_no.length + '位，长度必须为11位');
    }
  });

  elementEventRegister(iCustomerSaleman, "keyup paste", updateBillWeight);
  elementEventRegister(iDsClient, "keyup paste", updateBillWeight);
  elementEventRegister(iConsignee, "keyup paste", updateBillWeight);
  elementEventRegister(iBillNum, "keyup paste", updateBillWeight);

  function updateBillWeight() {
    if (useForulma) {
      var l = parseFloatHTML(iCustomerSaleman.val());
      var w = parseFloatHTML(iDsClient.val());
      var t = parseFloatHTML(iConsignee.val());
      var res = l * w * t * 7.85 * Math.pow(10, -9);
      if (res > 0) {
        var fixed = toFixedStr(res, 3);
        setElementValue(iConsigner, fixed);
        setElementValue(iTotWeight, getStrValue((+fixed) * parseFloatHTML(iBillNum.val())));
      } else {
        iConsigner.val("");
        iTotWeight.val("");
      }
    }
  }

  elementEventRegister(iReceivingCharge, "ifChecked", function() {
    setHtmlElementDisabled(iTotWeight, true);
    setHtmlElementDisabled(iBillNum, false);
    updateBillWeight();
  });

  elementEventRegister(iReceivingCharge, "ifUnchecked", function() {
    setHtmlElementDisabled(iTotWeight, false);
    setHtmlElementDisabled(iBillNum, true);
    iConsigner.val("");
    iTotWeight.val("");
    iBillNum.val("");
  });

  elementEventRegister($('#ui_input_save'), "click", function () {
    if (allOrders.length) {
      ajaxRequestHandle('/create_bill', 'POST', allOrders, '数据保存', function() {
        initInputUIValues();
      });
    } else {
      bootbox.alert("没有数据, 请输入");
    }
  });

  elementEventRegister($('#add-one'), 'click', function() {
    var billNo = iOrderWeight.val();
    var orderNo = iOrderNo.val();
    var orderItemNo = sCustomerName.val();
    var billName = iCustomerCode.val();
    var totalWeight = iTotWeight.val();
    if (isEmpty(billNo)) {
      bootbox.alert('请输入提单号');
    } else if (isEmpty(orderNo)) {
      bootbox.alert('请输入订单号');
    } else if (orderNo.length != 11) {
      bootbox.alert('订单号的长度必须是11位, 当前输入长度为：' + orderNo.length);
    } else if (isEmpty(orderItemNo)) {
      bootbox.alert('请输入订单项次号');
    } else if (isEmpty(billName)) {
      bootbox.alert('请选择开单名称');
    } else if (isEmpty(totalWeight) && totalWeight > 0) {
      bootbox.alert('请输入总重量');
    } else {
      var isOk = true;
      var o = getOrder(orderNo, orderItemNo);
      for (var i = 0; i < allOrders.length; ++i) {
        if (allOrders[i].order === o) {
          bootbox.alert('不唯一, 订单号项次 + 提单号相同');
          isOk = false;
          break;
        }
      }
      if (isOk) {
        allOrders.push({
          order: getOrder(orderNo, orderItemNo),
          bill_no : billNo,
          order_no : orderNo,
          order_item_no : orderItemNo,
          brand_no : isEmpty(sBrand.val()) ? "" : sBrand.val(),
          billing_name : billName,
          sales_dep: isEmpty(sDestination.val()) ? "" : sDestination.val(),
          block_len : isEmpty(iCustomerSaleman.val()) ? "" : iCustomerSaleman.val(),
          width : isEmpty(iDsClient.val()) ? "" : iDsClient.val(),
          thickness : isEmpty(iConsignee.val()) ? "" : iConsignee.val(),
          size_type : sSizeType.val(),
          weight : isEmpty(iConsigner.val()) ? "" : iConsigner.val(),
          block_num : isEmpty(iBillNum.val()) ? "" : iBillNum.val(),
          total_weight: totalWeight,
          ship_warehouse : isEmpty(sTransportMode.val()) ? "" : sTransportMode.val(),
          contract_no : isEmpty(iContractNo.val()) ? "" : iContractNo.val(),
          product_type: isEmpty(iProduct.val()) ? "" : iProduct.val()
        });

        var html = "";
        allOrders.forEach(function(bill) {
          html += makeTableBodyTr(bill);
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

  function makeTableBodyTr(bill) {
    var str = '<tr><td style="cursor:pointer" class="td-icon"><i title="删除" class="fa fa-trash-o redlink"></i></td>';
    for (var i = 0; i < 14; ++i) {
      str += "<td>{" + i + "}</td>";
    }
    str += "</tr>";

    return str.format(bill.bill_no, getOrder(bill.order_no, bill.order_item_no), bill.billing_name,
      getStrValue(bill.thickness), getStrValue(bill.width), getStrValue(bill.block_len), bill.size_type,
      bill.block_num, getStrValue(bill.total_weight),
      bill.brand_no ? bill.brand_no : '',
      bill.sales_dep ? bill.sales_dep : '',
      bill.ship_warehouse ? bill.ship_warehouse : '',
      bill.contract_no ? bill.contract_no : '',
      bill.product_type ? bill.product_type : '');
  }
});