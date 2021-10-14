$(function(){"use strict";function e(){$.get("/get_max_waybill_no",{},function(e){var t=JSON.parse(e);t.ok?(ne=t.max_no,le=0,ae=null,G="new",waybillHandler.reset(""),showHtmlElement($("#inv-head-info"),!0),$("#waybill_oper_text").text("新建运单号: "),$("#waybill_no").text(ne),showHtmlElement(T,!0),E(),I.prop("disabled",!1),A.prop("disabled",!1)):bootbox.alert("新建失败:"+t.response)})}function t(e){$.get("/get_bill_by_name",{q:e},function(t){var n=jQuery.parseJSON(t);waybillHandler.reset(e),n.bills.forEach(function(e){waybillHandler.addBill(e)}),waybillHandler.insertSelectOptions(W,e),W.select2("val",""),Q.select2("val","");for(var l=0;l<Z.company.length;++l)if(e===Z.company[l].name){initSelect(F,Z.company[l].customers,!1);break}x()})}function n(){for(var e=0,t=M.find("tr").length;e<t;++e){var n=getRowChildren(M,e),l=getTableCellChildren(n,te+1);if(l.find("input").length){var a=+getTableCellChildren(n,te).find("input").val(),i=+l.find("input").val();if(a>0&&0===i||0===a&&i>0)return!1}}return!0}function l(e,t,l){if(ce){if(re>0)return void bootbox.alert("车号:"+J.val()+"未确定配发完毕, 保存前请确定.");for(var a=0,i=M.find("tr").length;a<i;++a){var o=getRowChildren(M,a);if(isEmpty(o.find("td:last-child").text()))return void bootbox.alert("由于你选择了船发运, 请为每个提单选择船发运相对应的车辆号, 否则不能保存!")}}if(!n())return void bootbox.alert("请输入发运块数和发运重量,两者缺一不可, 否则不能保存!");if(!ne)return void bootbox.alert("运单号为空，不能保存!");var r=waybillHandler.getSelectedBills(),s={waybill_no:ne,vehicle_vessel_name:I.val(),ship_name:A.val(),ship_customer:F.val(),ship_from:N.val(),ship_to:pe?B.val():P.val(),ship_date:Y.data("DateTimePicker").getDate(),bills:r.slice(0),total_weight:ie,username:X,shipper:X,state:e};ajaxRequestHandle(t,"POST",s,l,function(){waybillHandler.saveInvoice(s),waybillHandler.insertSelectOptions(W,waybillHandler.shipName),"ADD"===ee&&M.empty(),Q.select2("val",""),"已配发"===e?(ae=void 0,ne="",waybillHandler.reset(""),ce=!1,T.toggle(),E(),"MODIFY"===ee?(z.select2("val",""),de.val("")):($("#waybill_no").text(ne),G="idle")):(setHtmlElementDisabled(C,!0),G="saved")})}function a(e){var t=getTableCellChildren(e,te+1);return{num:+getTableCellChildren(e,te).find("input").val(),weight:t.find("input").length?+t.find("input").val():+t.text()}}function i(e){e&&(showHtmlElement($("#inv-table-input th:last-child, #inv-table-input td:last-child"),ce),showHtmlElement($("#vehicle-info"),"REMOVE"!==ee&&ce));var t=waybillHandler.hasMixedBill(),n="实际块数",l="剩余块数";2===t?(n="实际重量",l="剩余重量"):3===t&&(n="实际块数/重量",l="剩余块数/重量"),$("#real-head-text").text(n),$("#left-head-text").text(l)}function o(e,t,n,l,a){var i=e.block_num>0?getStrValue(e.weight):"",o='<tr><td style="cursor:pointer" class="td-icon"><i title="删除" class="fa fa-trash-o redlink"></i></td><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td align="center">{7}</td><td align="center">{8}</td>'.format(e.bill_no,getOrder(e.order_no,e.order_item_no),e.ship_warehouse?e.ship_warehouse:"",getStrValue(e.thickness),getStrValue(e.width),getStrValue(e.len),i,getStrValue(t),getStrValue(n));return e.block_num>0?(o+='<td><input type="text" name="ship_number" data-toggle="tooltip" title="最大可用块数:{0}, 剩余块数:{1}" class="ship-num form-control" value="{2}"/></td>'.format(e.left,n,l),o+='<td align="center">'+getStrValue(a)+"</td>"):(o+='<td><input type="text" name="ship_number" class="ship-num form-control" value="'+l+'"/></td>',o+='<td><input type="text" name="ship_weight" data-toggle="tooltip" title="最大可用重量:{0}, 剩余重量:{1}" class="ship-num form-control" value="{2}"/></td>'.format(getStrValue(e.left),n,getStrValue(a))),o}function r(e,t){var n='<select disabled style="width: 100%" name="'+e+'">';return isEmpty(t)&&(n+='<option selected disabled hidden value=""></option>'),me.forEach(function(e){n+="<option "+(e===t?"selected":"")+">"+e+"</option>"}),n+"</select>"}function s(e){var t=J.val(),n=ne+leftPad(le,3);return'<td align="center" title="'+n+'" name="'+e+'">'+(t?t:"")+"</td>"}function d(e,t,n){for(var l=M.find("tr").length,i=[],o=0;o<l;++o){var r=getRowChildren(M,o),s=getTableCellChildren(r,1).text(),d=getTableCellChildren(r,2).text();if(e.bill_no===s&&getOrder(e.order_no,e.order_item_no)===d){if(t&&ce){if(e.vehicles&&e.vehicles.length){var h=a(r),c=r.find("td:last").find("select").val(),m=!1;e.vehicles.forEach(function(e){var t=e.inner_waybill_no.substring(0,17);m||t!==ae.waybill_no||h.num!==e.send_num||c!==e.veh_name||(m=!0,i.push(r))})}}else i.push(r);if(n&&i.length)return i}}return i}function h(e,t,n){if(ce||!d(e,!0,!0).length){var l=e.left-t,a=e.block_num>0?e.block_num:e.total_weight,i=0,h=0,c="";if("ADD"===ee||"REMOVE"===ee||"MODIFY"===ee&&!ce){if(e.block_num>0?(i=t,h=t*e.weight):(i="ADD"===ee?0:e.prev_wnum_danding+e.wnum_danding,h=t),oe+=i,ie+=+h,c=o(e,a,l,i,h),ce)if("REMOVE"===ee){var m="<td>";e.vehicles.forEach(function(e){var t=e.inner_waybill_no.substring(0,17);t===ae.waybill_no&&(m+="<span>"+e.veh_name+"</span> <code>"+e.send_num+"</code><br />")}),c+=m+"</td></tr>"}else c+=s("wagon_no")+"</tr>",re+=i,se+=+h;else c+="<td></td></tr>";M.prepend(c)}else n?e.vehicles.forEach(function(t){var n=t.inner_waybill_no.substring(0,17);n===ae.waybill_no&&(i=t.send_num,h=e.block_num>0?i*e.weight:t.send_weight,oe+=i,ie+=+h,c=o(e,a,l,i,h)+'<td title="'+t.inner_waybill_no+'">'+r("wagon_no_init",t.veh_name)+"</td></tr>",M.append(c))}):(c=o(e,a,e.left_num,0,0),M.prepend(c+s("wagon_no_new")+"</tr>"))}}function c(e){var t=d(e,!1,!1);if(t.length){var n=getStrValue(e.left_num);t.forEach(function(e){getTableCellChildren(e,te-1).text(n)})}}function m(e,t,n,l){if(ce){var a=t.find("td:last"),i=a.prop("title"),o=a.find("select").length?a.find("select").val():a.text(),r=a.attr("name");if("wagon_no"!==r&&"wagon_no_new"!==r||(re+=n,se+=l,re<0&&(re=0),(se<0||Math.abs(se)<1e-5)&&(se=0)),Math.abs(n)>0||Math.abs(l)>1e-5)for(var s=0;s<e.vehicles.length;++s){var d=e.vehicles[s];if(d.inner_waybill_no===i){d.send_num+=n,d.send_weight+=l,d.send_weight=toFixedNumber(d.send_weight,3),d.veh_name=o,0===d.send_num&&d.send_weight<1e-5&&e.vehicles.remove(s);break}}}oe+=n,ie+=l,(ie<0||Math.abs(ie)<1e-5)&&(ie=0)}function p(){elementEventRegister($(".redlink"),"click",function(e){e.stopImmediatePropagation();var t=$(this).closest("tr"),n=waybillHandler.getBill(t),l=a(t),i="MODIFY"===ee&&ce;waybillHandler.deleteTableRow(n,i,l,function(e,a){l.num>0&&m(n,t,0-l.num,0-l.weight),i&&c(n),u(!0,!1,n.order_no,n.bill_no,a,e),t.remove()})}),inputEventRegister($('input[name="ship_number"]'),function(e){var t=e.closest("tr"),n=parseInt(e.data("old"))||0,l=n,a=waybillHandler.getBill(t);if(a.block_num>0){l=numberIntValider(e,0,a.left_num+n);var i=l-n;if(0!=i){var o=i*a.weight;waybillHandler.updateShipNum(a,i,function(n,r){e.prop("title","最大可用块数:{0}, 剩余块数:{1}".format(a.left,a.left_num)),"MODIFY"===ee&&ce?c(a):getTableCellChildren(t,te-1).text(a.left_num),getTableCellChildren(t,te+1).text(getStrValue(l*a.weight)),m(a,t,i,o),u(!1,!1,a.order_no,a.bill_no,r,n),e.data("old",l)})}}else l=numberIntValider(e,0,2e3),l!=n&&(0===n&&a.wnum_danding>0?(a.prev_wnum_danding=a.wnum_danding,a.wnum_danding=l):a.wnum_danding+=l-n,m(a,t,l-n,0),u(!1,!1,a.order_no,a.bill_no,"",""),e.data("old",l))}),inputEventRegister($('input[name="ship_weight"]'),function(e){var t=parseFloat(e.data("old"))||0,n=e.closest("tr"),l=waybillHandler.getBill(n),a=numberFloatValider(e,t,0,toFixedNumber(l.left_num+t,3)),i=a-t;Math.abs(i)>1e-6&&waybillHandler.updateShipNum(l,i,function(t,o){e.prop("title","最大可用重量:{0}, 剩余重量:{1}".format(getStrValue(l.left),getStrValue(l.left_num))),"MODIFY"===ee&&ce?c(l):getTableCellChildren(n,te-1).text(getStrValue(l.left_num)),m(l,n,0,i),u(!1,!1,l.order_no,l.bill_no,o,t),e.data("old",a)})}),$('select[name="wagon_no_init"]').on("focus",function(){$(this).data("old",this.value||"")}).on("change",function(){$(this).data("new",this.value);var e=$(this);bootbox.confirm("您确定要修改此提单记录的车号?",function(t){if(t){e.closest("tr")}else e.val(e.data("old")),e.data("new",e.data("old"))})})}function u(e,t,n,l,a,o){e&&i(t),w(),y(),W.find('option[value="{0}"]'.format(n)).prop("title",a);var r=Q.find('option[value="{0}"]'.format(l));r.prop("title",o.tip),r.prop("disabled",0===o.left_num)}function _(){re=0,se=0,k.text("0.000"),$("#vehicle-ship-num").text(0),K.select2("val","南钢"),setHtmlElementDisabled(L,!0)}function v(e){for(var t=!1,n=0;n<Z.vehInfo.length;++n){var l=Z.vehInfo[n];if(l.name===e){var a="车船号";"车"===l.veh_type?a="车号":"船"===l.veh_type&&(a="船号",t=!0),$("#lb-vehicle").text(a);break}}return t}function b(e){waybillHandler.reset(waybillHandler.shipName),ne=e,le=0,ae=waybillHandler.getWaybill(e),ae&&(waybillHandler.setName(ae.ship_name),g())}function f(e,t){var n=jQuery.extend({},e);return n.inner_waybill_no=t.inner_waybill_no,n.bveh_send_num=t.send_num,n.bveh_send_weight=e.block_num>0?t.send_num*e.weight:t.send_weight,n.bveh_name=t.veh_name,n}function g(){if(ce=v(ae.vehicle_vessel_name),"REPORT"===ee)D();else{T.fadeIn("slow"),nlApp.setTitle("正在读取运单数据，请稍等..."),nlApp.showPleaseWait(),"ADD"===ee?(I.select2("val",ae.vehicle_vessel_name),A.select2("val",ae.ship_name)):(I.val(ae.vehicle_vessel_name),A.val(ae.ship_name),$("#invoice_state").val(ae.state));for(var e=0;e<Z.company.length;++e)if(ae.ship_name===Z.company[e].name){initSelect(F,Z.company[e].customers,!1);break}F.val(ae.ship_customer),B.val(ae.ship_to),P.select2("val",ae.ship_to),N.select2("val",ae.ship_from),Y.data("DateTimePicker").setDate(ae.ship_date),x(),$.get("/get_bill_by_name",{q:ae.ship_name},function(e){var t=jQuery.parseJSON(e);t.bills.forEach(function(e){waybillHandler.addBill(e)});var n=waybillHandler.getBillsFromInvoice(ae);if("MODIFY"===ee&&ce){var l=[];n.forEach(function(e){var t=waybillHandler.addBillAndTableRow_1(e,e.wnum);W.find(":selected").prop("title",t.tips),e.vehicles.forEach(function(e){e.inner_waybill_no&&ae.waybill_no===e.inner_waybill_no.substring(0,17)&&l.push(f(t.updatedBill,e))})}),l=sortByKey(l,"inner_waybill_no","ASC"),l.forEach(function(e){var t=e.block_num>0?e.block_num:e.total_weight;oe+=e.bveh_send_num,ie+=+e.bveh_send_weight;var n=o(e,t,e.left_num,e.bveh_send_num,e.bveh_send_weight)+'<td title="'+e.inner_waybill_no+'" name="wagon_no_init">'+r("wagon_no_init",e.bveh_name)+"</td></tr>";M.append(n)})}else n.forEach(function(e){var t=e.wnum;waybillHandler.addBillAndTableRow(e,t,function(n,l){n.openToNew?n.block_num>0?(ie+=t*e.weight,oe+=t):(ie+=+t,oe+=e.prev_wnum_danding+e.wnum_danding):h(n,t,!0),W.length&&W.find(":selected").prop("title",l)})});"REMOVE"===ee?H():(p(),I.prop("disabled",!0),A.prop("disabled",!0)),ce&&(le=getMaxInnerWaybillNo(n,ae.waybill_no)),w(),i(!0),W.length&&waybillHandler.insertSelectOptions(W,ae.ship_name),setHtmlElementDisabled(C,!0),setHtmlElementDisabled(O,!0),Q.select2("val",""),nlApp.hidePleaseWait()})}}function w(){q.text(toFixedStr(ie,3)),j.text(oe),ce&&($("#vehicle-ship-num").text(re),k.text(toFixedStr(se,3)),setHtmlElementDisabled(L,re<=0||isEmpty(J.val())))}function y(){if(setHtmlElementDisabled(C,!0),setHtmlElementDisabled(O,!0),!ae||"已结算"!=ae.state){var e=I.val(),t=pe?B.val():P.val(),n=N.val(),l=F.val(),a=isEmpty(e),i=isEmpty(t);if(!(a||i||isEmpty(n))){var o=Y.data("DateTimePicker").getDate(),r=isEmpty(o),s=waybillHandler.hasSelectedBills()||oe>0&&ie>0;if(ae){var d=!waybillHandler.compare(ae),h=!0;ae.ship_date&&!r&&(h=!moment(ae.ship_date,"YYYY-MM-DD HH:mm").isSame(o)),(ae.ship_to!=t||h||ae.vehicle_vessel_name!=e||d||ae.ship_from!=n||ae.ship_customer!=l)&&(setHtmlElementDisabled(C,!1),!r&&s&&setHtmlElementDisabled(O,!1))}else!r&&s?(setHtmlElementDisabled(C,!1),setHtmlElementDisabled(O,!1)):s&&setHtmlElementDisabled(C,!1)}}}function E(){N.select2("val","南钢"),P.select2("val",""),B.val(""),Y.length&&Y.data("DateTimePicker").setDate(""),"ADD"===ee||"MODIFY"===ee?(I.select2("val",""),A.select2("val","")):(I.val(""),A.val("")),"REMOVE"===ee?H():(W.empty(),Q.empty(),J.select2("val",""),setHtmlElementDisabled(C,!0),setHtmlElementDisabled(O,!0)),x(),z.length>0&&(z.val(""),z.select2("val",""),unselected(de))}function x(){ie=0,oe=0,M.empty(),w()}function H(){T.find("input").prop("disabled",!0),T.find("select").prop("disabled",!0),$("#inv-table-input").find("input").prop("disabled",!0),Y.length&&Y.data("DateTimePicker").disable()}function V(e,t,n){var l=$("#dict_name"),a=$("#data-btn-ok");setElementValue($("#phone"),""),setElementValue($("#contact"),""),setElementValue($("#address"),""),setElementValue(l,getElementValue(t)),l.prop("disabled",!0),setHtmlElementDisabled(a,!1),a.on("click",function(){n(),$("#data-dialog").modal("hide")}),$("#lbl-name").text(e),$("#dialog-title").text("编辑"+e),$("#data-dialog").modal({backdrop:"static",keyboard:!1}).modal("show")}function D(){showHtmlElement($("#waybill-tools"),!0),$("#report-content").fadeIn("slow"),setElementValue($("#report-bill-name"),ae.ship_name),setElementValue($("#report-ship-customer"),ae.ship_customer?ae.ship_customer:ae.ship_name);var e=$("#report-bill-phone");setElementValue(e,"");for(var t=0;t<Z.company.length;++t){var n=Z.company[t];if(n.name===ae.ship_name){setElementValue(e,n.phone);break}}setElementValue($("#report-ship-to"),ae.ship_to);var l=$("#report-shipto-phone"),a=$("#report-shipto-contact");setElementValue(l,""),setElementValue(a,"");for(var i=0;i<Z.destination.length;++i){var o=Z.destination[i];if(o.name===ae.ship_to){setElementValue(l,o.phone),setElementValue(a,o.contact_name);break}}setElementValue($("#report-waybill-no"),ae.waybill_no),setElementValue($("#report-vehicle-name"),ae.vehicle_vessel_name),ae.ship_date?setElementValue($("#report-ship-date"),date2Str(ae.ship_date,!1)):setElementValue($("#report-ship-date"),""),setElementValue($("#report-ship-from"),ae.ship_from),Z.vehInfo.forEach(function(e){e.name===ae.vehicle_vessel_name&&setElementValue($("#report-ship-phone"),e.phone)});var r=waybillHandler.getBillsFromInvoice(ae);$("#report-table-body").html(S(r)),showHtmlElement($("#report-th-vessel"),ce),U.trigger("update");var s=0,d=0;r.forEach(function(e){e.block_num>0?(d+=e.weight*e.wnum,s+=e.wnum):(d+=e.wnum,s+=e.prev_wnum_danding+e.wnum_danding)}),setElementValue($("#report-total-weight"),toFixedStr(d,3)),setElementValue($("#report-total-number"),s)}function S(e){var t=[],n="<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td><td>{11}</td></tr>";if(ce){var l=[];e.forEach(function(e){e.invoices.forEach(function(t){t.inv_no===ne&&t.vehicles.forEach(function(t){l.push(f(e,t))})})}),l=sortByKey(l,"inner_waybill_no","ASC"),l.forEach(function(e){t.push(n.format(e.bill_no,getOrder(e.order_no,e.order_item_no),e.brand_no?e.brand_no:"",getStrValue(e.thickness),getStrValue(e.width),getStrValue(e.len),e.block_num>0?getStrValue(e.weight):"",e.bveh_send_num,getStrValue(e.bveh_send_weight),e.ship_warehouse?e.ship_warehouse:"",e.contract_no?e.contract_no:"",e.bveh_name))})}else n="<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td></tr>",e.forEach(function(e){e.block_num>0?t.push(n.format(e.bill_no,getOrder(e.order_no,e.order_item_no),e.brand_no?e.brand_no:"",getStrValue(e.thickness),getStrValue(e.width),getStrValue(e.len),getStrValue(e.weight),getStrValue(e.wnum),getStrValue(e.weight*e.wnum),e.ship_warehouse?e.ship_warehouse:"",e.contract_no?e.contract_no:"")):t.push(n.format(e.bill_no,getOrder(e.order_no,e.order_item_no),e.brand_no?e.brand_no:"",getStrValue(e.thickness),getStrValue(e.width),getStrValue(e.len),"",getStrValue(e.prev_wnum_danding+e.wnum_danding),getStrValue(e.wnum),e.ship_warehouse?e.ship_warehouse:"",e.contract_no?e.contract_no:""))});return t.join("")}var k=$("#vehicle-ship-weight"),R=$("#invoice_new"),C=$("#invoice_save"),O=$("#invoice_save_shipping"),T=$("#invoice-input-content"),M=$("#invoice_tbody"),I=$("#vehicle_name"),A=$("#ship_name"),F=$("#ship_customer"),B=$("#ship_to_input"),P=$("#ship-to-select"),N=$("#start-warehouse"),Y=$("#ship-date-grp"),q=$("#total_weight_td"),j=$("#total_number_td"),Q=$("#bill_no"),W=$("#order_no_by_name"),J=$("#vehicle-no"),K=$("#origin"),L=$("#vehicle-ship-confirm"),U=$("#report-table"),z=$("#waybill_no_query"),G="idle",X=local_user.userid,Z=local_dict_data,ee=local_action,te=10,ne="",le=0,ae=null,ie=0,oe=0,re=0,se=0;waybillHandler.init(""),z.length&&select2Setup(z,{inputLength:4,placeholder:"查找运单号",url:"/get_waybill"},function(e){waybillHandler.setQueryData(e)}),Y.length&&Y.datetimepicker(getDateTimePickerOptions()).on("dp.change change",y);var de=$("#my_waybill_query"),he=$("#checkWaybillForMe");he.length&&he.iCheck("uncheck");var ce=!1,me=[];isEmpty(Z)||"REPORT"===ee||(Z.warehouse=sort_pinyin(Z.warehouse),Z.destination=sort_pinyin(Z.destination),initSelect(N,Z.warehouse,!1),initSelect(P,Z.destination,!1),initSelect(K,Z.warehouse,!1),K.select2(),K.select2("val","南钢"),N.select2(),N.select2("val",""),P.select2(),P.select2("val",""),Z.vehInfo.forEach(function(e){"车"===e.veh_type&&me.push(e.name)}),me=sort_pinyin(me),initSelect(J,me,!1),J.select2(),Q.select2(),W.select2()),E();var pe=!1;if("ADD"===ee||"MODIFY"===ee){var ue="/build_invoice";"ADD"===ee?(isEmpty(Z)||(initSelect(A,sort_pinyin(getAllList(!1,Z.company,"name")),!1),initSelect(I,sort_pinyin(Z.vehicles),!1),I.select2(),A.select2()),elementEventRegister(R,"click",function(){C.hasClass("disabled")?"idle"!==G?bootbox.confirm("确定要重新创建运单?",function(t){t&&e()}):e():bootbox.confirm("有数据未保存, 确定要重新创建一个运单?",function(t){t&&e()})}),elementEventRegister(A,"change",function(){$(this).data("old",$(this).data("new")||"");var e=$(this).data("old"),n=this.value;oe>0&&ie>0||waybillHandler.hasSelectedBills()?bootbox.confirm("开单名称的改变将导致所有的您选择的提单数据丢失,确认吗?",function(l){l?t(n):A.select2("val",e)}):t(n),$(this).data("new",n)}),elementEventRegister(I,"change",function(){var e=$(this);e.data("old",e.data("new")||"");var t=v(this.value);if(ce!==t)if(ce=t,showHtmlElement($("#inv-table-input th:last-child, #inv-table-input td:last-child"),ce),showHtmlElement($("#vehicle-info"),"REMOVE"!==ee&&ce),t){if(_(),"saved"===G){var n=ne+leftPad(le,3);waybillHandler.showSelectedBill(n,function(e,t,n,l){re+=n,se+=l,M.append(o(e,t,e.left,n,l)+s("wagon_no")+"</tr>")},function(){p(),i(!1),w(),y()})}}else le>0?bootbox.confirm("你之前选择的是船,现在选择的车,针对每个提单的车号信息都会被清空,确定改变吗?",function(t){t?(waybillHandler.clearVehicles(ne),$('td[name="wagon_no"]').text(""),_()):(showHtmlElement($("#inv-table-input th:last-child, #inv-table-input td:last-child"),!0),showHtmlElement($("#vehicle-info"),"REMOVE"!==ee),$("#lb-vehicle").text("船号"),ce=!0,e.val(e.data("old")),e.data("new",e.val()))}):(waybillHandler.clearVehicles(ne),$('td[name="wagon_no"]').text(""));y(),e.data("new",e.val())})):ue="/distribute_invoice",elementEventRegister(C,"click",function(){ae&&"已结算"===ae.state?bootbox.alert("此运单已结算,不能修改保存!"):l("新建",ue,"保存配发货/登记")}),elementEventRegister(O,"click",function(){ae&&"已结算"===ae.state?bootbox.alert("此运单已结算,不能修改配发!"):bootbox.confirm("确定配发当前选择的订单?",function(e){e&&l("已配发",ue,"保存并确定配发")})}),elementEventRegister(B,"keyup paste",y),elementEventRegister(P,"change",y),elementEventRegister($("#lbl-ship-to"),"click",function(){B.toggle(),showHtmlElement($("#s2id_ship-to-select"),pe),pe=!pe,B.val(""),P.select2("val",""),y()}),elementEventRegister(W,"change",function(){var e=waybillHandler.findCreate(this.value,!1);e.found&&(Q.empty(),e.data.getOptions(A.val()).forEach(function(e){Q.append(e)}),Q.select2("val",""))}),elementEventRegister(Q,"change",function(){var e=ce?ne+leftPad(le,3):"",t=W.val(),n=Q.val(),l=waybillHandler.addAndInsertTable(t,n,e);if(l&&l.bills.length){l.bills.forEach(function(e){h(e,0,!1)});var a=M.find("tr");a.removeClass("selected-highlighted");for(var i=l.bills.length,o=0;o<a.length;++o)for(var r=getRowChildren(M,o),s=getTableCellChildren(r,1).text(),d=getTableCellChildren(r,2).text(),c=0;c<i;++c)if(s===l.bills[c].bill_no&&d===getOrder(l.bills[c].order_no,l.bills[c].order_item_no)){r.addClass("selected-highlighted");break}p(),u(!0,!0,t,n,l.tip,l.billtips)}}),elementEventRegister(N,"change",y),elementEventRegister(F,"change",y),elementEventRegister(J,"change",function(){$(this).data("old",$(this).data("new")||"");var e=$(this).data("old"),t=this.value;$(this).data("new",t);var n="ADD"===ee?$('td[name="wagon_no"]'):$('td[name="wagon_no_new"]');if(re>0)if(e){var l='车辆号:"'+e+'"还没确定配发完成, 如果更换车辆号,之前的这辆车的配发数据无效并被丢失, 确定吗?';bootbox.confirm(l,function(l){l?(n.text(t),setHtmlElementDisabled(L,re<=0||isEmpty(t))):(J.select2("val",e),$(this).data("new",e))})}else n.text(t),setHtmlElementDisabled(L,re<=0||isEmpty(t));else{n.text(t);var i=M.find("tr").length;if(i>0){for(var o=0;o<i;++o){var r=getRowChildren(M,o),s=r.find("td:last").attr("name");if("wagon_no"===s||"wagon_no_new"===s){var d=a(r);re+=d.num,se+=d.weight}}w()}else _()}}),elementEventRegister(L,"click",function(){if(n()){var e=J.val();waybillHandler.handleVehicleComplete(ne+leftPad(le,3),e,K.val()),"ADD"===ee?M.empty():($('td[name="wagon_no_new"]').attr("name","wagon_no_confirm"),M.find("tr").removeClass("selected-highlighted")),Q.select2("val",""),J.select2("val",""),J.data("old",""),J.data("new",""),waybillHandler.insertSelectOptions(W,null),_(),++le,bootbox.alert('车辆: "'+e+'"配发完成!')}else bootbox.alert("请完成发运块数和发运重量的输入!")})}else"REPORT"===ee&&($.extend($.tablesorter.defaults,{theme:"blue"}),U.tablesorter({widgets:["stickyHeaders"]}),$("#lbl-destination").on("click",function(){V("目的地",$("#report-ship-to"),function(){setElementValue($("#report-shipto-phone"),getElementValue($("#phone"))),setElementValue($("#report-shipto-contact"),getElementValue($("#contact")))})}),$("#lbl-bill-name").on("click",function(){V("发货单位",$("#report-bill-name"),function(){setElementValue($("#report-bill-phone"),getElementValue($("#phone")))})}),elementEventRegister($("#report-print"),"click",function(){var e=$("#report-tool"),t=$("#footer");e.toggle(),t.toggle(),window.print(),e.toggle(),t.toggle()}),elementEventRegister($("#report-export"),"click",function(){var e=waybillHandler.getBillsFromInvoice(ae),t=ae.ship_customer;isEmpty(t)&&(t=ae.ship_name);var n="";ce?(n='<table><tr><th colspan="12">南京鑫鸿图储运有限公司发货单</th>',n+='<tr><td colspan="3">运单号：'+ae.waybill_no+'</td><td colspan="6">开单名称:'+ae.ship_name+'</td><td colspan="3" align="right">目的地:'+ae.ship_to+"</td></tr>",n+='<tr><td colspan="3">车船号：'+ae.vehicle_vessel_name+'</td><td colspan="6">发货单位:'+t+'</td><td colspan="3" align="right">电话:'+$("#report-shipto-phone").text()+"</td>",n+='<tr><td colspan="3">发货日期：'+$("#report-ship-date").text()+'</td></td><td colspan="6">电话:'+$("#report-bill-phone").text()+'</td><td colspan="3" align="right">联系人:'+$("#report-shipto-contact").text()+"</td></tr>",n+='<tr><td colspan="3">始发地: '+$("#report-ship-from").text()+'</td><td colspan="9"></td></tr>',n+='<tr><td colspan="3">车船电话: '+$("#report-ship-phone").text()+'</td><td colspan="9"></td></tr><tr><td colspan="12"></td></tr>',n+="<tr><th>提单号</th><th>订单号</th><th>牌号</th><th>厚度</th><th>宽度</th><th>长度</th><th>单重</th><th>发运数</th><th>发运重量</th><th>仓库</th><th>合同号</th><th>车号</th></tr>",n+=S(e)+'<tr><td colspan="12"></td></tr>',n+='<tr><th colspan="10" align="right">总重量:</th><th colspan="2" align="left">'+$("#report-total-weight").text()+"</th></tr>",n+='<tr><th colspan="10" align="right">总块数:</th><th colspan="2" align="left">'+$("#report-total-number").text()+"</th></tr></table>"):(n='<table><tr><th colspan="11">南京鑫鸿图储运有限公司发货单</th>',n+='<tr><td colspan="3">运单号：'+ae.waybill_no+'</td><td colspan="5">开单名称:'+ae.ship_name+'</td><td colspan="3" align="right">目的地:'+ae.ship_to+"</td></tr>",n+='<tr><td colspan="3">车船号：'+ae.vehicle_vessel_name+'</td><td colspan="5">发货单位:'+t+'</td><td colspan="3" align="right">电话:'+$("#report-shipto-phone").text()+"</td>",n+='<tr><td colspan="3">发货日期：'+$("#report-ship-date").text()+'</td></td><td colspan="5">电话:'+$("#report-bill-phone").text()+'</td><td colspan="3" align="right">联系人:'+$("#report-shipto-contact").text()+"</td></tr>",n+='<tr><td colspan="3">始发地: '+$("#report-ship-from").text()+'</td><td colspan="8"></td></tr>',n+='<tr><td colspan="3">车船电话: '+$("#report-ship-phone").text()+'</td><td colspan="8"></td></tr><tr><td colspan="12"></td></tr>',n+="<tr><th>提单号</th><th>订单号</th><th>牌号</th><th>厚度</th><th>宽度</th><th>长度</th><th>单重</th><th>发运数</th><th>发运重量</th><th>仓库</th><th>合同号</th><th>车号</th></tr>",n+=S(e)+'<tr><td colspan="11"></td></tr>',n+='<tr><th colspan="9" align="right">总重量:</th><th colspan="2" align="left">'+$("#report-total-weight").text()+"</th></tr>",n+='<tr><th colspan="9" align="right">总块数:</th><th colspan="2" align="left">'+$("#report-total-number").text()+"</th></tr></table>"),tableToExcel(n,ae.waybill_no,"运单数据"+date2Str(new Date)+".xls")}));elementEventRegister(he,"ifChecked",function(){showHtmlElement($("#div-my-select"),!0),showHtmlElement($("#div-select2"),!1);var e=new Date,t=new Date(e.setDate(e.getDate()-21)),n={$and:[{ship_date:{$gt:t}},{$or:[{shipper:X},{username:X}]}]};$.get("/get_invoices_by_condition",{q:JSON.stringify(n),isNeedAnalysis:!1},function(e){var t=JSON.parse(e);t.ok?(waybillHandler.setQueryData(t),de.empty(),$.each(t.invoices,function(e,t){de.append("<option value='"+t.waybill_no+"'>"+t.waybill_no+"</option>")}),unselected(de)):bootbox.alert("查询数据库有误！")})}),elementEventRegister(he,"ifUnchecked",function(){showHtmlElement($("#div-my-select"),!1),showHtmlElement($("#div-select2"),!0)}),elementEventRegister(de,"change",function(){b(this.value)}),elementEventRegister(z,"change",function(e){e.added&&b(e.added.text)}),elementEventRegister($("#invoice_search"),"click",function(){var e=new SearchHandlerD("invoice");e.initial("/get_invoices_by_condition"),e.okEventHandler(function(e,t){ae=waybillHandler.resetWithQueryData(e,t),ne=ae.waybill_no,le=0,$("#search_dialog").modal("hide"),"ADD"===ee?(waybillHandler.openToNew=!0,showHtmlElement($("#inv-head-info"),!0),$("#waybill_oper_text").text("打开运单号: "),$("#waybill_no").text(ne)):z.length&&(z.select2("val",ne),de.val(ne)),g()}),$("#search_dialog").modal({backdrop:"static",keyboard:!1}).modal("show")}),elementEventRegister($("#waybill_delete"),"click",function(){ae&&ne&&("已结算"===ae.state?bootbox.alert("此运单已结算,不能删除!"):bootbox.confirm("您确定要删除吗?",function(e){e&&ajaxRequestHandle("/delete_invoice","POST",ae,"运单删除:"+ne,function(){waybillHandler.reset(""),ae=null,ne="",de.find('[value="'+ne+'"]').remove(),E()})}))}),$("#invoice_import").on("click",function(){bootbox.alert("功能还在实现中...,请稍等!")})});
//# sourceMappingURL=invoice_mgt.js.map
