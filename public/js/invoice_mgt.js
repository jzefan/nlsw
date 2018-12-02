$(function(){"use strict";var e=$("#vehicle-ship-weight"),t=$("#invoice_new"),c=$("#invoice_save"),p=$("#invoice_save_shipping"),d=$("#invoice-input-content"),m=$("#invoice_tbody"),u=$("#vehicle_name"),h=$("#ship_name"),_=$("#ship_customer"),v=$("#ship_to_input"),b=$("#ship-to-select"),g=$("#start-warehouse"),f=$("#ship-date-grp"),n=$("#total_weight_td"),l=$("#total_number_td"),w=$("#bill_no"),y=$("#order_no_by_name"),E=$("#vehicle-no"),a=$("#origin"),x=$("#vehicle-ship-confirm"),H=$("#report-table"),V=$("#waybill_no_query"),D="idle",k=local_user.userid,S=local_dict_data,R=local_action,s=10,C="",O=0,T=null,M=0,I=0,A=0,F=0;waybillHandler.init(""),V.length&&select2Setup(V,{inputLength:4,placeholder:"查找运单号",url:"/get_waybill"},function(e){waybillHandler.setQueryData(e)}),f.length&&f.datetimepicker(getDateTimePickerOptions()).on("dp.change change",de);var B=$("#my_waybill_query"),i=$("#checkWaybillForMe");i.length&&i.iCheck("uncheck");var P=!1,o=[];isEmpty(S)||"REPORT"===R||(S.warehouse=sort_pinyin(S.warehouse),S.destination=sort_pinyin(S.destination),initSelect(g,S.warehouse,!1),initSelect(b,S.destination,!1),initSelect(a,S.warehouse,!1),a.select2(),a.select2("val","南钢"),g.select2(),g.select2("val",""),b.select2(),b.select2("val",""),S.vehInfo.forEach(function(e){"车"===e.veh_type&&o.push(e.name)}),o=sort_pinyin(o),initSelect(E,o,!1),E.select2(),w.select2(),y.select2()),he();var N=!1;if("ADD"===R||"MODIFY"===R){var r="/build_invoice";"ADD"===R?(isEmpty(S)||(initSelect(h,sort_pinyin(getAllList(!1,S.company,"name")),!1),initSelect(u,sort_pinyin(S.vehicles),!1),u.select2(),h.select2()),elementEventRegister(t,"click",function(){c.hasClass("disabled")?"idle"!==D?bootbox.confirm("确定要重新创建运单?",function(e){e&&Y()}):Y():bootbox.confirm("有数据未保存, 确定要重新创建一个运单?",function(e){e&&Y()})}),elementEventRegister(h,"change",function(){$(this).data("old",$(this).data("new")||"");var t=$(this).data("old"),n=this.value;0<I&&0<M||waybillHandler.hasSelectedBills()?bootbox.confirm("开单名称的改变将导致所有的您选择的提单数据丢失,确认吗?",function(e){e?q(n):h.select2("val",t)}):q(n),$(this).data("new",n)}),elementEventRegister(u,"change",function(){var t=$(this);t.data("old",t.data("new")||"");var e=ae(this.value);if(P!==e)if(P=e,showHtmlElement($("#inv-table-input th:last-child, #inv-table-input td:last-child"),P),showHtmlElement($("#vehicle-info"),"REMOVE"!==R&&P),e){if(le(),"saved"===D){var n=C+leftPad(O,3);waybillHandler.showSelectedBill(n,function(e,t,n,l){A+=n,F+=l,m.append(L(e,t,e.left,n,l)+z("wagon_no")+"</tr>")},function(){te(),K(!1),se(),de()})}}else 0<O?bootbox.confirm("你之前选择的是船,现在选择的车,针对每个提单的车号信息都会被清空,确定改变吗?",function(e){e?(waybillHandler.clearVehicles(C),$('td[name="wagon_no"]').text(""),le()):(showHtmlElement($("#inv-table-input th:last-child, #inv-table-input td:last-child"),!0),showHtmlElement($("#vehicle-info"),"REMOVE"!==R),$("#lb-vehicle").text("船号"),P=!0,t.val(t.data("old")),t.data("new",t.val()))}):(waybillHandler.clearVehicles(C),$('td[name="wagon_no"]').text(""));de(),t.data("new",t.val())})):r="/distribute_invoice",elementEventRegister(c,"click",function(){T&&"已结算"===T.state?bootbox.alert("此运单已结算,不能修改保存!"):W("新建",r,"保存配发货/登记")}),elementEventRegister(p,"click",function(){T&&"已结算"===T.state?bootbox.alert("此运单已结算,不能修改配发!"):bootbox.confirm("确定配发当前选择的订单?",function(e){e&&W("已配发",r,"保存并确定配发")})}),elementEventRegister(v,"keyup paste",de),elementEventRegister(b,"change",de),elementEventRegister($("#lbl-ship-to"),"click",function(){v.toggle(),showHtmlElement($("#s2id_ship-to-select"),N),N=!N,v.val(""),b.select2("val",""),de()}),elementEventRegister(y,"change",function(){var e=waybillHandler.findCreate(this.value,!1);e.found&&(w.empty(),e.data.getOptions(h.val()).forEach(function(e){w.append(e)}),w.select2("val",""))}),elementEventRegister(w,"change",function(){var e=P?C+leftPad(O,3):"",t=y.val(),n=w.val(),l=waybillHandler.addAndInsertTable(t,n,e);if(l&&l.bills.length){l.bills.forEach(function(e){X(e,0,!1)});var a=m.find("tr");a.removeClass("selected-highlighted");for(var i=l.bills.length,o=0;o<a.length;++o)for(var r=getRowChildren(m,o),s=getTableCellChildren(r,1).text(),d=getTableCellChildren(r,2).text(),h=0;h<i;++h)if(s===l.bills[h].bill_no&&d===getOrder(l.bills[h].order_no,l.bills[h].order_item_no)){r.addClass("selected-highlighted");break}te(),ne(!0,!0,t,n,l.tip,l.billtips)}}),elementEventRegister(g,"change",de),elementEventRegister(_,"change",de),elementEventRegister(E,"change",function(){$(this).data("old",$(this).data("new")||"");var t=$(this).data("old"),n=this.value;$(this).data("new",n);var l="ADD"===R?$('td[name="wagon_no"]'):$('td[name="wagon_no_new"]');if(0<A)if(t){var e='车辆号:"'+t+'"还没确定配发完成, 如果更换车辆号,之前的这辆车的配发数据无效并被丢失, 确定吗?';bootbox.confirm(e,function(e){e?(l.text(n),setHtmlElementDisabled(x,A<=0||isEmpty(n))):(E.select2("val",t),$(this).data("new",t))})}else l.text(n),setHtmlElementDisabled(x,A<=0||isEmpty(n));else{l.text(n);var a=m.find("tr").length;if(0<a){for(var i=0;i<a;++i){var o=getRowChildren(m,i),r=o.find("td:last").attr("name");if("wagon_no"===r||"wagon_no_new"===r){var s=J(o);A+=s.num,F+=s.weight}}se()}else le()}}),elementEventRegister(x,"click",function(){if(j()){var e=E.val();waybillHandler.handleVehicleComplete(C+leftPad(O,3),e,a.val()),"ADD"===R?m.empty():($('td[name="wagon_no_new"]').attr("name","wagon_no_confirm"),m.find("tr").removeClass("selected-highlighted")),w.select2("val",""),E.select2("val",""),E.data("old",""),E.data("new",""),waybillHandler.insertSelectOptions(y,null),le(),++O,bootbox.alert('车辆: "'+e+'"配发完成!')}else bootbox.alert("请完成发运块数和发运重量的输入!")})}else"REPORT"===R&&($.extend($.tablesorter.defaults,{theme:"blue"}),H.tablesorter({widgets:["stickyHeaders"]}),$("#lbl-destination").on("click",function(){me("目的地",$("#report-ship-to"),function(){setElementValue($("#report-shipto-phone"),getElementValue($("#phone"))),setElementValue($("#report-shipto-contact"),getElementValue($("#contact")))})}),$("#lbl-bill-name").on("click",function(){me("发货单位",$("#report-bill-name"),function(){setElementValue($("#report-bill-phone"),getElementValue($("#phone")))})}),elementEventRegister($("#report-print"),"click",function(){var e=$("#report-tool"),t=$("#footer");e.toggle(),t.toggle(),window.print(),e.toggle(),t.toggle()}),elementEventRegister($("#report-export"),"click",function(){var e=waybillHandler.getBillsFromInvoice(T),t=T.ship_customer;isEmpty(t)&&(t=T.ship_name);var n="";P?(n='<table><tr><th colspan="12">南京鑫鸿图储运有限公司发货单</th>',n+='<tr><td colspan="3">运单号：'+T.waybill_no+'</td><td colspan="6">开单名称:'+T.ship_name+'</td><td colspan="3" align="right">目的地:'+T.ship_to+"</td></tr>",n+='<tr><td colspan="3">车船号：'+T.vehicle_vessel_name+'</td><td colspan="6">发货单位:'+t+'</td><td colspan="3" align="right">电话:'+$("#report-shipto-phone").text()+"</td>",n+='<tr><td colspan="3">发货日期：'+$("#report-ship-date").text()+'</td></td><td colspan="6">电话:'+$("#report-bill-phone").text()+'</td><td colspan="3" align="right">联系人:'+$("#report-shipto-contact").text()+"</td></tr>",n+='<tr><td colspan="3">始发地: '+$("#report-ship-from").text()+'</td><td colspan="9"></td></tr>',n+='<tr><td colspan="3">车船电话: '+$("#report-ship-phone").text()+'</td><td colspan="9"></td></tr><tr><td colspan="12"></td></tr>',n+="<tr><th>提单号</th><th>订单号</th><th>牌号</th><th>厚度</th><th>宽度</th><th>长度</th><th>单重</th><th>发运数</th><th>发运重量</th><th>仓库</th><th>合同号</th><th>车号</th></tr>",n+=ue(e)+'<tr><td colspan="12"></td></tr>',n+='<tr><th colspan="10" align="right">总重量:</th><th colspan="2" align="left">'+$("#report-total-weight").text()+"</th></tr>",n+='<tr><th colspan="10" align="right">总块数:</th><th colspan="2" align="left">'+$("#report-total-number").text()+"</th></tr></table>"):(n='<table><tr><th colspan="11">南京鑫鸿图储运有限公司发货单</th>',n+='<tr><td colspan="3">运单号：'+T.waybill_no+'</td><td colspan="5">开单名称:'+T.ship_name+'</td><td colspan="3" align="right">目的地:'+T.ship_to+"</td></tr>",n+='<tr><td colspan="3">车船号：'+T.vehicle_vessel_name+'</td><td colspan="5">发货单位:'+t+'</td><td colspan="3" align="right">电话:'+$("#report-shipto-phone").text()+"</td>",n+='<tr><td colspan="3">发货日期：'+$("#report-ship-date").text()+'</td></td><td colspan="5">电话:'+$("#report-bill-phone").text()+'</td><td colspan="3" align="right">联系人:'+$("#report-shipto-contact").text()+"</td></tr>",n+='<tr><td colspan="3">始发地: '+$("#report-ship-from").text()+'</td><td colspan="8"></td></tr>',n+='<tr><td colspan="3">车船电话: '+$("#report-ship-phone").text()+'</td><td colspan="8"></td></tr><tr><td colspan="12"></td></tr>',n+="<tr><th>提单号</th><th>订单号</th><th>牌号</th><th>厚度</th><th>宽度</th><th>长度</th><th>单重</th><th>发运数</th><th>发运重量</th><th>仓库</th><th>合同号</th><th>车号</th></tr>",n+=ue(e)+'<tr><td colspan="11"></td></tr>',n+='<tr><th colspan="9" align="right">总重量:</th><th colspan="2" align="left">'+$("#report-total-weight").text()+"</th></tr>",n+='<tr><th colspan="9" align="right">总块数:</th><th colspan="2" align="left">'+$("#report-total-number").text()+"</th></tr></table>"),tableToExcel(n,T.waybill_no,"运单数据"+date2Str(new Date)+".xls")}));function Y(){$.get("/get_max_waybill_no",{},function(e){var t=JSON.parse(e);t.ok?(C=t.max_no,O=0,T=null,D="new",waybillHandler.reset(""),showHtmlElement($("#inv-head-info"),!0),$("#waybill_oper_text").text("新建运单号: "),$("#waybill_no").text(C),showHtmlElement(d,!0),he(),u.prop("disabled",!1),h.prop("disabled",!1)):bootbox.alert("新建失败:"+t.response)})}function q(l){$.get("/get_bill_by_name",{q:l},function(e){var t=jQuery.parseJSON(e);waybillHandler.reset(l),t.bills.forEach(function(e){waybillHandler.addBill(e)}),waybillHandler.insertSelectOptions(y,l),y.select2("val",""),w.select2("val","");for(var n=0;n<S.company.length;++n)if(l===S.company[n].name){initSelect(_,S.company[n].customers,!1);break}ce()})}function j(){for(var e=0,t=m.find("tr").length;e<t;++e){var n=getRowChildren(m,e),l=getTableCellChildren(n,s+1);if(l.find("input").length){var a=+getTableCellChildren(n,s).find("input").val(),i=+l.find("input").val();if(0<a&&0===i||0===a&&0<i)return!1}}return!0}elementEventRegister(i,"ifChecked",function(){showHtmlElement($("#div-my-select"),!0),showHtmlElement($("#div-select2"),!1);var e=new Date,t={$and:[{ship_date:{$gt:new Date(e.setDate(e.getDate()-21))}},{$or:[{shipper:k},{username:k}]}]};$.get("/get_invoices_by_condition",{q:JSON.stringify(t),isNeedAnalysis:!1},function(e){var t=JSON.parse(e);t.ok?(waybillHandler.setQueryData(t),B.empty(),$.each(t.invoices,function(e,t){B.append("<option value='"+t.waybill_no+"'>"+t.waybill_no+"</option>")}),unselected(B)):bootbox.alert("查询数据库有误！")})}),elementEventRegister(i,"ifUnchecked",function(){showHtmlElement($("#div-my-select"),!1),showHtmlElement($("#div-select2"),!0)}),elementEventRegister(B,"change",function(){ie(this.value)}),elementEventRegister(V,"change",function(e){e.added&&ie(e.added.text)}),elementEventRegister($("#invoice_search"),"click",function(){var e=new SearchHandlerD("invoice");e.initial("/get_invoices_by_condition"),e.okEventHandler(function(e,t){T=waybillHandler.resetWithQueryData(e,t),C=T.waybill_no,O=0,$("#search_dialog").modal("hide"),"ADD"===R?(waybillHandler.openToNew=!0,showHtmlElement($("#inv-head-info"),!0),$("#waybill_oper_text").text("打开运单号: "),$("#waybill_no").text(C)):V.length&&(V.select2("val",C),B.val(C)),re()}),$("#search_dialog").modal({backdrop:"static",keyboard:!1}).modal("show")}),elementEventRegister($("#waybill_delete"),"click",function(){T&&C&&("已结算"===T.state?bootbox.alert("此运单已结算,不能删除!"):bootbox.confirm("您确定要删除吗?",function(e){e&&ajaxRequestHandle("/delete_invoice","POST",T,"运单删除:"+C,function(){waybillHandler.reset(""),T=null,C="",B.find('[value="'+C+'"]').remove(),he()})}))});var Q=!0;function W(e,t,n){if(P){if(0<A)return void bootbox.alert("车号:"+E.val()+"未确定配发完毕, 保存前请确定.");for(var l=0,a=m.find("tr").length;l<a;++l){var i=getRowChildren(m,l);if(isEmpty(i.find("td:last-child").text()))return void bootbox.alert("由于你选择了船发运, 请为每个提单选择船发运相对应的车辆号, 否则不能保存!")}}if(j())if(C){var o="新建"===e?c:p;if(o.prop("disabled",!0),Q){console.log("saving ...."),Q=!1;var r=waybillHandler.getSelectedBills(),s={waybill_no:C,vehicle_vessel_name:u.val(),ship_name:h.val(),ship_customer:_.val(),ship_from:g.val(),ship_to:N?v.val():b.val(),ship_date:f.data("DateTimePicker").getDate(),bills:r.slice(0),total_weight:M,username:k,shipper:k,state:e};ajaxRequestHandle(t,"POST",s,n,function(){waybillHandler.saveInvoice(s),waybillHandler.insertSelectOptions(y,waybillHandler.shipName),"ADD"===R&&m.empty(),w.select2("val",""),"已配发"===e?(T=void 0,C="",waybillHandler.reset(""),P=!1,d.toggle(),he(),"MODIFY"===R?(V.select2("val",""),B.val("")):($("#waybill_no").text(C),D="idle")):(setHtmlElementDisabled(c,!0),D="saved"),o.prop("disabled",!1),Q=!0})}else console.log("cannot click it");setTimeout(function(){Q=!0},1500)}else bootbox.alert("运单号为空，不能保存!");else bootbox.alert("请输入发运块数和发运重量,两者缺一不可, 否则不能保存!")}function J(e){var t=getTableCellChildren(e,s+1);return{num:+getTableCellChildren(e,s).find("input").val(),weight:t.find("input").length?+t.find("input").val():+t.text()}}function K(e){e&&(showHtmlElement($("#inv-table-input th:last-child, #inv-table-input td:last-child"),P),showHtmlElement($("#vehicle-info"),"REMOVE"!==R&&P));var t=waybillHandler.hasMixedBill(),n="实际块数",l="剩余块数";2===t?(n="实际重量",l="剩余重量"):3===t&&(n="实际块数/重量",l="剩余块数/重量"),$("#real-head-text").text(n),$("#left-head-text").text(l)}function L(e,t,n,l,a){var i=0<e.block_num?getStrValue(e.weight):"",o='<tr><td style="cursor:pointer" class="td-icon"><i title="删除" class="fa fa-trash-o redlink"></i></td><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td align="center">{7}</td><td align="center">{8}</td>'.format(e.bill_no,getOrder(e.order_no,e.order_item_no),e.ship_warehouse?e.ship_warehouse:"",getStrValue(e.thickness),getStrValue(e.width),getStrValue(e.len),i,getStrValue(t),getStrValue(n));return 0<e.block_num?(o+='<td><input type="text" name="ship_number" data-toggle="tooltip" title="最大可用块数:{0}, 剩余块数:{1}" class="ship-num form-control" value="{2}"/></td>'.format(e.left,n,l),o+='<td align="center">'+getStrValue(a)+"</td>"):(o+='<td><input type="text" name="ship_number" class="ship-num form-control" value="'+l+'"/></td>',o+='<td><input type="text" name="ship_weight" data-toggle="tooltip" title="最大可用重量:{0}, 剩余重量:{1}" class="ship-num form-control" value="{2}"/></td>'.format(getStrValue(e.left),n,getStrValue(a))),o}function U(e,t){var n='<select disabled style="width: 100%" name="'+e+'">';return isEmpty(t)&&(n+='<option selected disabled hidden value=""></option>'),o.forEach(function(e){n+="<option "+(e===t?"selected":"")+">"+e+"</option>"}),n+"</select>"}function z(e){var t=E.val();return'<td align="center" title="'+(C+leftPad(O,3))+'" name="'+e+'">'+(t||"")+"</td>"}function G(e,t,n){for(var l=m.find("tr").length,a=[],i=0;i<l;++i){var o=getRowChildren(m,i),r=getTableCellChildren(o,1).text(),s=getTableCellChildren(o,2).text();if(e.bill_no===r&&getOrder(e.order_no,e.order_item_no)===s){if(t&&P){if(e.vehicles&&e.vehicles.length){var d=J(o),h=o.find("td:last").find("select").val(),c=!1;e.vehicles.forEach(function(e){var t=e.inner_waybill_no.substring(0,17);c||t!==T.waybill_no||d.num!==e.send_num||h!==e.veh_name||(c=!0,a.push(o))})}}else a.push(o);if(n&&a.length)return a}}return a}function X(t,e,n){if(P||!G(t,!0,!0).length){var l=t.left-e,a=0<t.block_num?t.block_num:t.total_weight,i=0,o=0,r="";if("ADD"===R||"REMOVE"===R||"MODIFY"===R&&!P){if(o=0<t.block_num?(i=e)*t.weight:(i="ADD"===R?0:t.prev_wnum_danding+t.wnum_danding,e),I+=i,M+=+o,r=L(t,a,l,i,o),P)if("REMOVE"===R){var s="<td>";t.vehicles.forEach(function(e){e.inner_waybill_no.substring(0,17)===T.waybill_no&&(s+="<span>"+e.veh_name+"</span> <code>"+e.send_num+"</code><br />")}),r+=s+"</td></tr>"}else r+=z("wagon_no")+"</tr>",A+=i,F+=+o;else r+="<td></td></tr>";m.prepend(r)}else n?t.vehicles.forEach(function(e){e.inner_waybill_no.substring(0,17)===T.waybill_no&&(i=e.send_num,o=0<t.block_num?i*t.weight:e.send_weight,I+=i,M+=+o,r=L(t,a,l,i,o)+'<td title="'+e.inner_waybill_no+'">'+U("wagon_no_init",e.veh_name)+"</td></tr>",m.append(r))}):(r=L(t,a,t.left_num,0,0),m.prepend(r+z("wagon_no_new")+"</tr>"))}}function Z(e){var t=G(e,!1,!1);if(t.length){var n=getStrValue(e.left_num);t.forEach(function(e){getTableCellChildren(e,s-1).text(n)})}}function ee(e,t,n,l){if(P){var a=t.find("td:last"),i=a.prop("title"),o=a.find("select").length?a.find("select").val():a.text(),r=a.attr("name");if("wagon_no"!==r&&"wagon_no_new"!==r||((A+=n)<0&&(A=0),((F+=l)<0||Math.abs(F)<1e-5)&&(F=0)),0<Math.abs(n)||1e-5<Math.abs(l))for(var s=0;s<e.vehicles.length;++s){var d=e.vehicles[s];if(d.inner_waybill_no===i){d.send_num+=n,d.send_weight+=l,d.send_weight=toFixedNumber(d.send_weight,3),d.veh_name=o,0===d.send_num&&d.send_weight<1e-5&&e.vehicles.remove(s);break}}}I+=n,((M+=l)<0||Math.abs(M)<1e-5)&&(M=0)}function te(){elementEventRegister($(".redlink"),"click",function(e){e.stopImmediatePropagation();var n=$(this).closest("tr"),l=waybillHandler.getBill(n),a=J(n),i="MODIFY"===R&&P;waybillHandler.deleteTableRow(l,i,a,function(e,t){0<a.num&&ee(l,n,0-a.num,0-a.weight),i&&Z(l),ne(!0,!1,l.order_no,l.bill_no,t,e),n.remove()})}),inputEventRegister($('input[name="ship_number"]'),function(n){var l=n.closest("tr"),e=parseInt(n.data("old"))||0,a=e,i=waybillHandler.getBill(l);if(0<i.block_num){var o=(a=numberIntValider(n,0,i.left_num+e))-e;if(0!=o){var r=o*i.weight;waybillHandler.updateShipNum(i,o,function(e,t){n.prop("title","最大可用块数:{0}, 剩余块数:{1}".format(i.left,i.left_num)),"MODIFY"===R&&P?Z(i):getTableCellChildren(l,s-1).text(i.left_num),getTableCellChildren(l,s+1).text(getStrValue(a*i.weight)),ee(i,l,o,r),ne(!1,!1,i.order_no,i.bill_no,t,e),n.data("old",a)})}}else(a=numberIntValider(n,0,2e3))!=e&&(0===e&&0<i.wnum_danding?(i.prev_wnum_danding=i.wnum_danding,i.wnum_danding=a):i.wnum_danding+=a-e,ee(i,l,a-e,0),ne(!1,!1,i.order_no,i.bill_no,"",""),n.data("old",a))}),inputEventRegister($('input[name="ship_weight"]'),function(n){var e=parseFloat(n.data("old"))||0,l=n.closest("tr"),a=waybillHandler.getBill(l),i=numberFloatValider(n,e,0,toFixedNumber(a.left_num+e,3)),o=i-e;1e-6<Math.abs(o)&&waybillHandler.updateShipNum(a,o,function(e,t){n.prop("title","最大可用重量:{0}, 剩余重量:{1}".format(getStrValue(a.left),getStrValue(a.left_num))),"MODIFY"===R&&P?Z(a):getTableCellChildren(l,s-1).text(getStrValue(a.left_num)),ee(a,l,0,o),ne(!1,!1,a.order_no,a.bill_no,t,e),n.data("old",i)})}),$('select[name="wagon_no_init"]').on("focus",function(){$(this).data("old",this.value||"")}).on("change",function(){$(this).data("new",this.value);var t=$(this);bootbox.confirm("您确定要修改此提单记录的车号?",function(e){if(e)t.closest("tr");else t.val(t.data("old")),t.data("new",t.data("old"))})})}function ne(e,t,n,l,a,i){e&&K(t),se(),de(),y.find('option[value="{0}"]'.format(n)).prop("title",a);var o=w.find('option[value="{0}"]'.format(l));o.prop("title",i.tip),o.prop("disabled",0===i.left_num)}function le(){F=A=0,e.text("0.000"),$("#vehicle-ship-num").text(0),a.select2("val","南钢"),setHtmlElementDisabled(x,!0)}function ae(e){for(var t=!1,n=0;n<S.vehInfo.length;++n){var l=S.vehInfo[n];if(l.name===e){var a="车船号";"车"===l.veh_type?a="车号":"船"===l.veh_type&&(a="船号",t=!0),$("#lb-vehicle").text(a);break}}return t}function ie(e){waybillHandler.reset(waybillHandler.shipName),C=e,O=0,(T=waybillHandler.getWaybill(e))&&(waybillHandler.setName(T.ship_name),re())}function oe(e,t){var n=jQuery.extend({},e);return n.inner_waybill_no=t.inner_waybill_no,n.bveh_send_num=t.send_num,n.bveh_send_weight=0<e.block_num?t.send_num*e.weight:t.send_weight,n.bveh_name=t.veh_name,n}function re(){if(P=ae(T.vehicle_vessel_name),"REPORT"===R)!function(){showHtmlElement($("#waybill-tools"),!0),$("#report-content").fadeIn("slow"),setElementValue($("#report-bill-name"),T.ship_name),setElementValue($("#report-ship-customer"),T.ship_customer?T.ship_customer:T.ship_name);var e=$("#report-bill-phone");setElementValue(e,"");for(var t=0;t<S.company.length;++t){var n=S.company[t];if(n.name===T.ship_name){setElementValue(e,n.phone);break}}setElementValue($("#report-ship-to"),T.ship_to);var l=$("#report-shipto-phone"),a=$("#report-shipto-contact");setElementValue(l,""),setElementValue(a,"");for(var i=0;i<S.destination.length;++i){var o=S.destination[i];if(o.name===T.ship_to){setElementValue(l,o.phone),setElementValue(a,o.contact_name);break}}setElementValue($("#report-waybill-no"),T.waybill_no),setElementValue($("#report-vehicle-name"),T.vehicle_vessel_name),T.ship_date?setElementValue($("#report-ship-date"),date2Str(T.ship_date,!1)):setElementValue($("#report-ship-date"),"");setElementValue($("#report-ship-from"),T.ship_from),S.vehInfo.forEach(function(e){e.name===T.vehicle_vessel_name&&setElementValue($("#report-ship-phone"),e.phone)});var r=waybillHandler.getBillsFromInvoice(T);$("#report-table-body").html(ue(r)),showHtmlElement($("#report-th-vessel"),P),H.trigger("update");var s=0,d=0;r.forEach(function(e){0<e.block_num?(d+=e.weight*e.wnum,s+=e.wnum):(d+=e.wnum,s+=e.prev_wnum_danding+e.wnum_danding)}),setElementValue($("#report-total-weight"),toFixedStr(d,3)),setElementValue($("#report-total-number"),s)}();else{d.fadeIn("slow"),nlApp.setTitle("正在读取运单数据，请稍等..."),nlApp.showPleaseWait(),"ADD"===R?(u.select2("val",T.vehicle_vessel_name),h.select2("val",T.ship_name)):(u.val(T.vehicle_vessel_name),h.val(T.ship_name),$("#invoice_state").val(T.state));for(var e=0;e<S.company.length;++e)if(T.ship_name===S.company[e].name){initSelect(_,S.company[e].customers,!1);break}_.val(T.ship_customer),v.val(T.ship_to),b.select2("val",T.ship_to),g.select2("val",T.ship_from),f.data("DateTimePicker").setDate(T.ship_date),ce(),$.get("/get_bill_by_name",{q:T.ship_name},function(e){var t=jQuery.parseJSON(e);t.ok&&t.bills.forEach(function(e){waybillHandler.addBill(e)});var n=waybillHandler.getBillsFromInvoice(T);if("MODIFY"===R&&P){var l=[];n.forEach(function(e){var t=waybillHandler.addBillAndTableRow_1(e,e.wnum);y.find(":selected").prop("title",t.tips),e.vehicles.forEach(function(e){e.inner_waybill_no&&T.waybill_no===e.inner_waybill_no.substring(0,17)&&l.push(oe(t.updatedBill,e))})}),(l=sortByKey(l,"inner_waybill_no","ASC")).forEach(function(e){var t=0<e.block_num?e.block_num:e.total_weight;I+=e.bveh_send_num,M+=+e.bveh_send_weight;var n=L(e,t,e.left_num,e.bveh_send_num,e.bveh_send_weight)+'<td title="'+e.inner_waybill_no+'" name="wagon_no_init">'+U("wagon_no_init",e.bveh_name)+"</td></tr>";m.append(n)})}else n.forEach(function(n){var l=n.wnum;waybillHandler.addBillAndTableRow(n,l,function(e,t){e.openToNew?0<e.block_num?(M+=l*n.weight,I+=l):(M+=+l,I+=n.prev_wnum_danding+n.wnum_danding):X(e,l,!0),y.length&&y.find(":selected").prop("title",t)})});"REMOVE"===R?pe():(te(),u.prop("disabled",!0),h.prop("disabled",!0)),P&&(O=getMaxInnerWaybillNo(n,T.waybill_no)),se(),K(!0),y.length&&waybillHandler.insertSelectOptions(y,T.ship_name),setHtmlElementDisabled(c,!0),setHtmlElementDisabled(p,!0),w.select2("val",""),nlApp.hidePleaseWait()})}}function se(){n.text(toFixedStr(M,3)),l.text(I),P&&($("#vehicle-ship-num").text(A),e.text(toFixedStr(F,3)),setHtmlElementDisabled(x,A<=0||isEmpty(E.val())))}function de(){if(setHtmlElementDisabled(c,!0),setHtmlElementDisabled(p,!0),!T||"已结算"!=T.state){var e=u.val(),t=N?v.val():b.val(),n=g.val(),l=_.val(),a=isEmpty(e),i=isEmpty(t);if(!(a||i||isEmpty(n))){var o=f.data("DateTimePicker").getDate(),r=isEmpty(o),s=waybillHandler.hasSelectedBills()||0<I&&0<M;if(T){var d=!waybillHandler.compare(T),h=!0;T.ship_date&&!r&&(h=!moment(T.ship_date,"YYYY-MM-DD HH:mm").isSame(o)),(T.ship_to!=t||h||T.vehicle_vessel_name!=e||d||T.ship_from!=n||T.ship_customer!=l)&&(setHtmlElementDisabled(c,!1),!r&&s&&setHtmlElementDisabled(p,!1))}else!r&&s?(setHtmlElementDisabled(c,!1),setHtmlElementDisabled(p,!1)):s&&setHtmlElementDisabled(c,!1)}}}function he(){g.select2("val","南钢"),b.select2("val",""),v.val(""),f.length&&f.data("DateTimePicker").setDate(""),"ADD"===R||"MODIFY"===R?(u.select2("val",""),h.select2("val","")):(u.val(""),h.val("")),"REMOVE"===R?pe():(y.empty(),w.empty(),E.select2("val",""),setHtmlElementDisabled(c,!0),setHtmlElementDisabled(p,!0)),ce(),0<V.length&&(V.val(""),V.select2("val",""),unselected(B))}function ce(){I=M=0,m.empty(),se()}function pe(){d.find("input").prop("disabled",!0),d.find("select").prop("disabled",!0),$("#inv-table-input").find("input").prop("disabled",!0),f.length&&f.data("DateTimePicker").disable()}function me(e,t,n){var l=$("#dict_name"),a=$("#data-btn-ok");setElementValue($("#phone"),""),setElementValue($("#contact"),""),setElementValue($("#address"),""),setElementValue(l,getElementValue(t)),l.prop("disabled",!0),setHtmlElementDisabled(a,!1),a.on("click",function(){n(),$("#data-dialog").modal("hide")}),$("#lbl-name").text(e),$("#dialog-title").text("编辑"+e),$("#data-dialog").modal({backdrop:"static",keyboard:!1}).modal("show")}function ue(e){var t=[],n="<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td><td>{11}</td></tr>";if(P){var l=[];e.forEach(function(t){t.invoices.forEach(function(e){e.inv_no===C&&e.vehicles.forEach(function(e){l.push(oe(t,e))})})}),(l=sortByKey(l,"inner_waybill_no","ASC")).forEach(function(e){t.push(n.format(e.bill_no,getOrder(e.order_no,e.order_item_no),e.brand_no?e.brand_no:"",getStrValue(e.thickness),getStrValue(e.width),getStrValue(e.len),0<e.block_num?getStrValue(e.weight):"",e.bveh_send_num,getStrValue(e.bveh_send_weight),e.ship_warehouse?e.ship_warehouse:"",e.contract_no?e.contract_no:"",e.bveh_name))})}else n="<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td></tr>",e.forEach(function(e){0<e.block_num?t.push(n.format(e.bill_no,getOrder(e.order_no,e.order_item_no),e.brand_no?e.brand_no:"",getStrValue(e.thickness),getStrValue(e.width),getStrValue(e.len),getStrValue(e.weight),getStrValue(e.wnum),getStrValue(e.weight*e.wnum),e.ship_warehouse?e.ship_warehouse:"",e.contract_no?e.contract_no:"")):t.push(n.format(e.bill_no,getOrder(e.order_no,e.order_item_no),e.brand_no?e.brand_no:"",getStrValue(e.thickness),getStrValue(e.width),getStrValue(e.len),"",getStrValue(e.prev_wnum_danding+e.wnum_danding),getStrValue(e.wnum),e.ship_warehouse?e.ship_warehouse:"",e.contract_no?e.contract_no:""))});return t.join("")}$("#invoice_import").on("click",function(){bootbox.alert("功能还在实现中...,请稍等!")})});
//# sourceMappingURL=invoice_mgt.js.map
