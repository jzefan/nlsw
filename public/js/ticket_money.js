function QueryFilterD(e,t){this.currSelected=0;var i=this;this.uiElems={sBfBillName:$("#bf-bill-name"),sBfSerialNumber:$("#bf-serial-number"),sBfDest:$("#bf-destination"),startDateGrp:$("#start-date-grp"),endDateGrp:$("#end-date-grp"),iStartDate:$("#start-date"),iEndDate:$("#end-date")},this.options=e,this.sDate=null,this.eDate=null,initSelect(this.uiElems.sBfBillName,e.nameList,!0),initSelect(this.uiElems.sBfSerialNumber,e.serials,!0),initSelect(this.uiElems.sBfDest,e.destList,!0),this.uiElems.iStartDate.val(""),this.uiElems.iEndDate.val(""),this._selectFliterFunc=function(e,t){this.currSelected=e,this.isAllEmpty()?t(!0):t(!1)},this._dateFilterFunc=function(e,t,i){var s=this.uiElems.iStartDate.val(),l=this.uiElems.iEndDate.val(),a=!1;e&&t?a=!isEmpty(s)&&!isEmpty(l):e?a=isEmpty(this.uiElems.iStartDate.val()):t&&(a=isEmpty(this.uiElems.iEndDate.val())),a&&i(!(this.currSelected=5))},i.uiElems.sBfBillName.on("change",function(){i._selectFliterFunc(1,t)}),i.uiElems.sBfSerialNumber.on("change",function(){i._selectFliterFunc(2,t)}),i.uiElems.sBfDest.on("change",function(){i._selectFliterFunc(4,t)}),i.uiElems.startDateGrp.datetimepicker(getDateTimePickerOptions()).on("dp.change",function(e){e.preventDefault(),e.stopImmediatePropagation(),i.sDate=e.date.startOf("day"),i.uiElems.endDateGrp.data("DateTimePicker").setMinDate(e.date),i._dateFilterFunc(!0,!0,t)}),i.uiElems.endDateGrp.datetimepicker(getDateTimePickerOptions()).on("dp.change",function(e){e.preventDefault(),e.stopImmediatePropagation(),i.eDate=e.date.endOf("day"),i.uiElems.startDateGrp.data("DateTimePicker").setMaxDate(e.date),i._dateFilterFunc(!0,!0,t)}),i.uiElems.iStartDate.on("change",function(e){e.stopImmediatePropagation(),i._dateFilterFunc(!0,!1,t)}),i.uiElems.iEndDate.on("change",function(e){e.stopImmediatePropagation(),i._dateFilterFunc(!1,!0,t)})}$(function(){"use strict";var r=$("#table-tbody"),a=local_dbData,n=[],o=[],c=[],u=a,d="CUSTOMER",i=$("#customer-btn"),s=$("#collection-btn"),l=$("#settle-delete"),m=$("#settle-ticket"),f=$("#settle-ticket-cancel"),h=$("#settle-money"),p=$("#settle-money-cancel"),b=$("#filter"),g=$("#search-export"),_=$("#show-detail"),v=$("#real-price-input"),E=0;h.length&&(E=1);var S=new QueryFilterD(C(local_dbData),function(e){u=S.updateOptions(a,e),L()});$("#first-th").html('<input id="select-all" type="checkbox" data-toggle="tooltip" data-placement="bottom" title="选择所有记录" />');var D=$("#select-all");function e(e,t){d!=e&&("CUSTOMER"===d?(i.removeClass("btn-primary"),i.addClass("btn-default")):"COLLECTION"===d&&(s.removeClass("btn-primary"),s.addClass("btn-default")),t.removeClass("btn-default"),t.addClass("btn-primary"),d=e,S.reset(C(local_dbData)),L())}function t(e){E=e,S.reset(C(local_dbData)),L()}function y(e){for(var t=r.find("tr").length;t--;)for(var i=getRowChildren(r,t),s=getTableCellChildren(i,2).text(),l=0;l<e.length;++l)if(e[l].serial_number===s){i.remove();break}D.prop("checked",e.length===r.find("tr").length),k()}function k(){if(o.length?(setHtmlElementDisabled(g,!1),setHtmlElementDisabled(b,!1)):(setHtmlElementDisabled(g,!0),setHtmlElementDisabled(b,!0)),c.length)if(setHtmlElementDisabled(_,1!=c.length),setHtmlElementDisabled(v,1!=c.length),h.length){for(var e=0,t=0,i=0;i<c.length;++i)"已开票"===c[i].status?++e:"已回款"===c[i].status&&++t;setHtmlElementDisabled(h,0===e),setHtmlElementDisabled(p,0===t)}else{setHtmlElementDisabled(l,!1);for(var s=0;s<c.length;++s)if("已开票"===c[s].status){setHtmlElementDisabled(f,!1);break}1===c.length&&setHtmlElementDisabled(m,!1)}else setHtmlElementDisabled(_,!0),h.length?(setHtmlElementDisabled(h,!0),setHtmlElementDisabled(p,!0),setHtmlElementDisabled(v,!0)):(setHtmlElementDisabled(m,!0),setHtmlElementDisabled(f,!0),setHtmlElementDisabled(l,!0))}function x(){var t=c[0],e='<div class="row form-horizontal"><div class="col-md-10">';e+='<div class="form-group"><label for="{0}" class="control-label col-sm-4">开票号</label><div class="input-group col-sm-8"><input id="{1}" type="text" name="{2}" class="form-control"></div></div>'.format(t.serial_number,t.serial_number,t.serial_number)+"</div></div>",bootbox.dialog({message:e,title:"开票:请输入票号",buttons:{cancel:{label:"取消",className:"btn-default"},main:{label:"确定",className:"btn-primary",callback:function(){var e="#"+t.serial_number;t.ticket_no=$(e).val(),t.ticket_date=new Date,t.ticket_person=local_user.userid,t.status="已开票",ajaxRequestHandle("/settle_ticket","POST",[t],"开票",function(){y([t])})}}}})}function L(){r.empty(),o=[],c=[];var t=[],i=0,s=0,l=0;u.forEach(function(e){(0===E&&"已结算"===e.status||1===E&&"已开票"===e.status||2===E&&"已回款"===e.status)&&("CUSTOMER"===d&&"客户结算"===e.settle_type||"COLLECTION"===d&&"代收代付结算"===e.settle_type)&&(t.push(function(e){var t=getStrByStatus(e.status,e.status),i='<tr data-toggle="popover" title="" data-content=""><td align="center"><input type="checkbox" class="select-item" /></td>',s="";s=isExist(e.real_price)&&0!=e.real_price&&e.real_price!=e.price?'<code style="color:red;font-weight:bold">'+getStrValue(e.real_price)+"</code>":'<code style="color:green">'+getStrValue(e.price)+"</code>";return(i+='<td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td><td>{11}</td><td align="center" style="cursor:pointer" class="td-icon"><i title="删除" class="fa fa-trash-o redlink"></i></td></tr>').format(t,e.serial_number,e.settle_type,e.billing_name,getStrValue(e.price),s,e.ship_number,getStrValue(e.ship_weight),isEmpty(e.settle_date)?"":moment(e.settle_date).format("YYYY-MM-DD"),e.settler?e.settler:"",isEmpty(e.ticket_date)?"":moment(e.ticket_date).format("YYYY-MM-DD"),e.ticket_no?e.ticket_no:"")}(e)),o.push(e),i+=e.ship_number,s+=e.ship_weight,l+=e.price)}),r.append(t.join("\n")),D.prop("checked",!1),k(),r.find("tr").on("click",function(){B($(this),!0)}).on("dblclick",function(){x()}),$(".select-item").on("click",function(e){e.stopImmediatePropagation(),B($(this).closest("tr"),!1)}),$('[data-toggle="popover"]').popover({trigger:"hover",html:!0,placement:"bottom"}),$(".td-icon").on("click",function(e){e.stopImmediatePropagation(),e.preventDefault();var t=$(this).closest("tr"),i=t.index(),s=o[i];"已结算"!=s.status?bootbox.alert("当前选择的结算纪录状态为"+s.status+", 不能删除!"):bootbox.confirm("您是否真的要删除此结算数据?",function(e){e&&ajaxRequestHandle("/delete_settle","POST",{allSelected:[s],which:d},"no_message",function(){for(var e=0;e<c.length;++e)if(c[e].serial_number===s.serial_number){c.remove(e);break}for(e=0;e<a.length;++e)if(a[e].serial_number===s.serial_number){a.remove(e);break}o.remove(i),t.remove(),$("#curr-settle-num").text(o.length),k(),bootbox.alert("删除成功!")})})}),$("#curr-settle-num").text(o.length),$("#lb-total-num").text(i),$("#lb-total-weight").text(getStrValue(s)),$("#lb-total-amount").text(getStrValue(l))}function B(e,t){for(var i=o[e.index()],s=!1,l=0;l<c.length;++l)if(c[l].serial_number===i.serial_number){c.remove(l),s=!0;break}s?e.removeClass("invoice-highlighted"):(c.push(i),e.addClass("invoice-highlighted")),t&&e.find('input[type="checkbox"]').prop("checked",!s),D.prop("checked",c.length===o.length),k()}function O(e,t,i){var s="";if("已结算"===e.status){var l=[];1==(1&e.settle_flag)&&l.push("客户"),2==(2&e.settle_flag)&&l.push("代收付"),s=getStrByStatus(l.join(",")+"已结算",e.status)}else s=getStrByStatus(e.status,e.status);for(var a,n,r,o,c,u=getInvoicePriceInfo(e),d=(a=e,n=u.totalCustomerPrice,r=u.totalVehPrice,('data-toggle="popover" title="'+a.order+" "+a.bill_no+'" data-content="客户价格: {0}<br />车船价格: {1}<br />代收代付价格: {2}<br />厚度: {3}<br />宽度: {4}<br />长度: {5}<br />尺寸: {6}<br />牌号: {7}<br />销售部门: {8}<br />发货仓库: {9}<br />合同号: {10}<br />"').format(getStrValue(n),getStrValue(r),getStrValue(a.collection_price*a.total_weight),getStrValue(a.thickness),getStrValue(a.width),getStrValue(a.len),a.size_type?a.size_type:"",a.brand_no?a.brand_no:"",a.sales_dep?a.sales_dep:"",a.ship_warehouse?a.ship_warehouse:"",a.contract_no?a.contract_no:"")),m="",f=0;f<e.invoices.length;++f){var h=e.invoices[f];if(h.inv_no===i.inv_no){"客户结算"===t?(o=h.veh_ves_name,c=getStrValue(h.price)):"代收代付结算"===t&&(o="",c=getStrValue(e.collection_price)),m=h.ship_to;break}}var p=getStrValue(e.thickness)+"*"+getStrValue(e.width)+"*"+e.len;return"<tr {0}><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td><td>{11}</td><td>{12}</td></tr>".format(d,s,getOrder(e.order_no,e.order_item_no),e.bill_no,p,e.billing_name,o,m,c,i.num,getStrValue(i.weight),getStrValue(c*i.weight),date2Str(e.shipping_date))}function C(e){var t=e,i={serials:[],destList:[],nameList:[]};return h.length?t.forEach(function(e){(1===E&&"已开票"===e.status||2===E&&"已回款"===e.status)&&(i.nameList.indexOf(e.billing_name)<0&&i.nameList.push(e.billing_name),i.serials.indexOf(e.serial_number)<0&&i.serials.push(e.serial_number),i.destList.indexOf(e.ship_to)<0&&i.destList.push(e.ship_to))}):t.forEach(function(e){(1===E&&"已开票"===e.status||0===E&&"已结算"===e.status)&&("CUSTOMER"===d&&"客户结算"===e.settle_type||"COLLECTION"===d&&"代收代付结算"===e.settle_type)&&(i.nameList.indexOf(e.billing_name)<0&&i.nameList.push(e.billing_name),i.serials.indexOf(e.serial_number)<0&&i.serials.push(e.serial_number),i.destList.indexOf(e.ship_to)<0&&i.destList.push(e.ship_to))}),i.serials.sort(),i.destList=sort_pinyin(i.destList),i.nameList=sort_pinyin(i.nameList),i}L(),elementEventRegister(D,"click",function(){$(this).is(":checked")?($(".select-item").prop("checked",!0),c=o,r.find("tr").addClass("invoice-highlighted")):($(".select-item").prop("checked",!1),c=[],r.find("tr").removeClass("invoice-highlighted")),k()}),elementEventRegister(i,"click",function(){e("CUSTOMER",$(this))}),elementEventRegister(s,"click",function(){e("COLLECTION",$(this))}),elementEventRegister(m,"click",x),elementEventRegister(f,"click",function(){bootbox.confirm("您是否真的要取消所选择的已开票数据?",function(e){if(e){var t=[];c.forEach(function(e){"已开票"===e.status&&(e.status="已结算",e.ticket_no="",e.ticket_date=null,e.ticket_person="",t.push(e))}),ajaxRequestHandle("/settle_ticket","POST",t,"开票取消",function(){y(t)})}})}),elementEventRegister(l,"click",function(){for(var e=0;e<c.length;++e)if("已结算"!=c[e].status)return void bootbox.alert("选择的结算纪录中存在状态["+c[e].status+"], 不能删除!");bootbox.confirm("您是否真的要删除选择的结算数据?",function(e){e&&ajaxRequestHandle("/delete_settle","POST",{allSelected:c,which:d},"no_message",function(){for(var e=a.length;e--;)for(var t=a[e],i=0;i<c.length;++i)if(c[i].serial_number===t.serial_number){a.remove(e),c.remove(i);break}L(),bootbox.alert("删除成功!")})})}),elementEventRegister(h,"click",function(){var t=[];c.forEach(function(e){"车船结算"!=e.settle_type&&(e.status="已回款",e.return_money_date=new Date,e.return_person=local_user.userid,t.push(e))}),ajaxRequestHandle("/settle_money","POST",t,"回款",function(){y(t)})}),elementEventRegister(p,"click",function(){bootbox.confirm("取消回款: 您是否真的要取消所选择的已回款数据?",function(e){if(e){var t=[];c.forEach(function(e){"已回款"===e.status&&(e.status="已开票",e.return_person="",e.return_money_date=null,t.push(e))}),ajaxRequestHandle("/settle_ticket","POST",t,"回款取消",function(){y(t)})}})}),elementEventRegister(_,"click",function(){var a=c[0];$("body").css({cursor:"wait"}),$.get("/get_settle_bill",{fSerial:a.serial_number},function(e){var t=jQuery.parseJSON(e);if(t.ok){n=t.bills;var i="",s=t.settle_bills;n.forEach(function(t){s.forEach(function(e){String(e.bill_id)===String(t._id)&&(i+=O(t,a.settle_type,e))})});var l=$("#settle-bill-tbody");l.empty(),l.append(i),$('[data-toggle="popover"]').popover({trigger:"hover",html:!0,placement:"bottom"}),$("#settle-detail-dialog").modal({backdrop:"static",keyboard:!1}).modal("show")}else n=[];$("body").css({cursor:"default"})})}),elementEventRegister($("#settle-radio"),"ifChecked",function(){t(0)}),elementEventRegister($("#ticket-radio"),"ifChecked",function(){t(1)}),elementEventRegister($("#money-radio"),"ifChecked",function(){t(2)}),elementEventRegister(v,"click",function(){var n=c[0],e='<div class="row form-horizontal"><div class="col-md-10">';e+='<div class="form-group"><label for="{0}" class="control-label col-sm-4">实收价格</label><div class="input-group col-sm-8"><input id="{1}" type="text" name="{2}" class="form-control"></div></div>'.format(n.serial_number,n.serial_number,n.serial_number)+"</div></div>",bootbox.dialog({message:e,title:"请输入实收价格",buttons:{cancel:{label:"取消",className:"btn-default"},main:{label:"确定",className:"btn-primary",callback:function(){var e="#"+n.serial_number,a=$(e).val();0<a?(n.real_price=a,ajaxRequestHandle("/settle_real_price","POST",{sno:n.serial_number,price:a},"实收价格",function(){for(var e=r.find("tr").length,t=0;t<e;++t){var i=getRowChildren(r,t),s=getTableCellChildren(i,2).text();if(s===n.serial_number){var l="";l=a!=n.price?'<code style="color:red;font-weight:bold">'+getStrValue(a)+"</code>":'<code style="color:green">'+getStrValue(n.price)+"</code>",getTableCellChildren(i,6).html(l);break}}})):bootbox.alert("无效的价格")}}}})}),elementEventRegister(g,"click",function(){if(0<c.length){var a=c[0];$.get("/get_settle_bill",{fSerial:a.serial_number},function(e){var t=jQuery.parseJSON(e);if(t.ok){n=t.bills;var i="",s=t.settle_bills;n.forEach(function(t){s.forEach(function(e){String(e.bill_id)===String(t._id)&&(i+=O(t,a.settle_type,e))})});var l=$("#settle-bill-tbody");l.empty(),l.append(i),tableToExcel($("#table-content").html(),"data")}})}else bootbox.alert("请选择要导出的结算记录")}),elementEventRegister(b,"click",function(){$("#filter-ui").toggle()})}),QueryFilterD.prototype.isAllEmpty=function(){var e=getSelectValue(this.uiElems.sBfSerialNumber),t=getSelectValue(this.uiElems.sBfDest),i=getSelectValue(this.uiElems.sBfBillName),s=this.uiElems.iStartDate.val(),l=this.uiElems.iEndDate.val();return isEmpty(e)&&isEmpty(t)&&isEmpty(i)&&isEmpty(s)&&isEmpty(l)},QueryFilterD.prototype.updateOptions=function(e,t){var a=getSelectValue(this.uiElems.sBfSerialNumber),n=getSelectValue(this.uiElems.sBfDest),r=getSelectValue(this.uiElems.sBfBillName),o={serials:[],destList:[],nameList:[]},c=[];if(t)initSelect(this.uiElems.sBfBillName,this.options.nameList,!0),initSelect(this.uiElems.sBfSerialNumber,this.options.serials,!0),initSelect(this.uiElems.sBfDest,this.options.destList,!0),c=e;else{var u=this.uiElems.iStartDate.val(),d=this.uiElems.iEndDate.val(),m=!isEmpty(u)&&!isEmpty(d);e.forEach(function(e){var t=!a||a===e.serial_number,i=!n||n===e.ship_to,s=!r||r===e.billing_name,l=moment(e.settle_date);t&&i&&s&&(!m||l.isAfter(u,"minute")&&l.isBefore(d,"minute"))&&(o.serials.indexOf(e.serial_number)<0&&o.serials.push(e.serial_number),o.destList.indexOf(e.ship_to)<0&&o.destList.push(e.ship_to),c.push(e))}),o.serials.sort(),o.destList=sort_pinyin(o.destList),o.nameList=sort_pinyin(o.nameList),2===this.currSelected?initSelect(this.uiElems.sBfDest,o.destList,!0,n):3===this.currSelected?(initSelect(this.uiElems.sBfDest,o.destList,!0,n),initSelect(this.uiElems.sBfSerialNumber,o.serials,!0,a)):4===this.currSelected?initSelect(this.uiElems.sBfSerialNumber,o.serials,!0,a):(initSelect(this.uiElems.sBfSerialNumber,o.serials,!0,a),initSelect(this.uiElems.sBfDest,o.destList,!0,n))}return c},QueryFilterD.prototype.reset=function(e){this.options=e,initSelect(this.uiElems.sBfBillName,this.options.nameList,!0),initSelect(this.uiElems.sBfSerialNumber,this.options.serials,!0),initSelect(this.uiElems.sBfDest,this.options.destList,!0)};
//# sourceMappingURL=ticket_money.js.map
