$(function(){"use strict";var e,a={},l=$("#vehves-name"),t=$("#radio-vehicle"),n=$("#radio-vessel"),i=$("#vehicle-table"),o=$("#vessel-table"),r=$("#data-btn-ok"),s=$("#stat-btn-ok"),v=$("#start-date-grp"),c=$("#end-date-grp"),d=$("#year-grp"),h=$("#month-grp"),m=$("#vvname"),u=$("#month-choice-grp"),f=$("#month-choice"),p=$("#i-ic"),g=$("#i-hc"),D=$("#i-pcc"),V=$("#i-aux"),b=$("#i-fittings"),y=$("#i-repair"),S=$("#i-as"),k=$("#i-salary"),E=$("#i-oil"),_=$("#i-toll"),H=$("#i-fine"),w=$("#i-other"),x=$("#i-total"),O=$("#data-input").find("input"),Y=$("#data-modify"),T=$("#data-delete"),F=$("#data-export"),M=!0,N=null,P=null,R="",C=[],B=TableHandler.createNew(!0);function j(e){M=e,showHtmlElement(i,e),showHtmlElement(o,!e),showHtmlElement($("#vehicle-row"),e),showHtmlElement($("#vessel-row"),!e),showHtmlElement($("#dd-col-vvname"),e),showHtmlElement($("#s2id_vehves-name"),e),showHtmlElement($("#lb-vehves-name"),e),B.setVehileFlag(e),B.show(Q),e||q({fVVName:["chuan"],fDate1:null,fDate2:null,fVVType:"chuan"})}function A(e){var t=$(e.target).attr("id");if("month-grp"===t)N=e.date.startOf("month"),P=moment(N).add(1,"months"),setHtmlElementDisabled(s,!1);else if("start-date-grp"===t)c.data("DateTimePicker").setMinDate(e.date),(N=e.date.startOf("month"))&&P&&N.isBefore(P)&&setHtmlElementDisabled(s,!1);else if("end-date-grp"===t)v.data("DateTimePicker").setMaxDate(e.date),P=e.date.startOf("month").add(1,"months"),N&&P&&N.isBefore(P)&&setHtmlElementDisabled(s,!1);else if("month-choice-grp"===t){R=e.date.startOf("month").format("YYYY-MM");var a=M?!isEmpty(R)&&0<x.val()&&m.val():!isEmpty(R)&&0<x.val();setHtmlElementDisabled(r,!a),J("month")}else N=e.date.startOf("year"),P=moment(N).add(1,"years"),setHtmlElementDisabled(s,!1)}function I(e,t,a){showHtmlElement($("#year-choose"),e),showHtmlElement($("#non-year-choose"),t),showHtmlElement($("#month-choose"),a)}function q(e){$("body").css({cursor:"wait"}),$.get("/get_vessel_fixed_cost_data",e,function(e){var t=jQuery.parseJSON(e);t.ok?B.setVVData(t.vvcList):B.setVVData([]),B.show(Q),$("body").css({cursor:"default"})})}function J(t){var a="chuan";M&&(a=m.val());var e={fName:a||"",fMonth:R||""};$.get("/get_one_vfc_data",e,function(e){jQuery.parseJSON(e).ok&&(bootbox.alert("不能增加, 记录已存在！车船名："+a+", 月份:"+R),"name"===t?m.select2().select2("val",""):"month"===t&&(R="",f.val("")))})}local_data&&(a=local_data,initSelect(l,a.vehicles,!1),initSelect(m,a.vehList,!1)),t.iCheck("check"),n.iCheck("uncheck"),l.select2(),m.select2(),(e=getDateTimePickerOptions()).minViewMode="months",e.format="YYYY-MM",v.datetimepicker(e).on("dp.change",A),c.datetimepicker(e).on("dp.change",A),h.datetimepicker(e).on("dp.change",A),e.minViewMode="years",e.format="YYYY",d.datetimepicker(e).on("dp.change",A),O.each(function(){this.value="",$(this).ForceNumericOnly()}),setHtmlElementDisabled(x,!0),t.on("ifChecked",function(){j(!0)}),n.on("ifChecked",function(){j(!1)}),$("#month-search").on("click",function(){P=N=null,$(".input-group.date").find("input").each(function(){this.value=""}),setHtmlElementDisabled(s,!0),$("#radio_month").iCheck("check"),$("#stat-condition-dialog").modal({backdrop:"static",keyboard:!1}).modal("show")}),$("#radio_month").on("ifChecked",function(){I(!1,!0,!1)}),$("#radio_single_year").on("ifChecked",function(){I(!0,!1,!1)}),$("#radio_single_month").on("ifChecked",function(){I(!1,!1,!0)}),s.on("click",function(){$("#stat-condition-dialog").modal("hide"),q({fVVName:C,fDate1:N.toISOString(),fDate2:P.toISOString(),fVVType:M?"che":"chuan"})}),elementEventRegister(l,"change",function(e){var t={fVVName:C=e.val,fDate1:"",fDate2:"",fVVType:M?"che":"chuan"};N&&P&&(t.fDate1=N.toISOString(),t.fDate2=P.toISOString()),q(t)});var L="";function Q(e){var t=e<0;setHtmlElementDisabled(Y,t),setHtmlElementDisabled(T,t)}elementEventRegister($("#data-add"),"click",function(){L="ADD",M&&(m.select2().select2("val",""),m.select2("enable")),R="",f.val(""),setHtmlElementDisabled(f,!1),setHtmlElementDisabled(u,!1),O.each(function(){this.value=""});var e=getDateTimePickerOptions();e.minViewMode="months",e.format="YYYY-MM",u.datetimepicker(e).on("dp.change",A),$("#data-dialog").modal({backdrop:"static",keyboard:!1}).modal("show")}),elementEventRegister(m,"change",function(e){var t=e.val,a=M?!isEmpty(R)&&0<x.val()&&t:!isEmpty(R)&&x.val();setHtmlElementDisabled(r,!a),J("name")}),elementEventRegister(O,"keyup paste",function(){var a=0;O.each(function(){var e=$(this).attr("id"),t=this.value;"i-total"!==e&&isNumeric(t)&&(a+=parseFloat(t))}),x.val(a);var e=M?!isEmpty(R)&&0<a&&m.val():!isEmpty(R)&&0<a;setHtmlElementDisabled(r,!e)}),r.on("click",function(){var t={name:M?m.val():"chuan",ic:p.val()?parseFloat(p.val()):0,hc:g.val()?parseFloat(g.val()):0,pcc:D.val()?parseFloat(D.val()):0,aux:V.val()?parseFloat(V.val()):0,fittings:b.val()?parseFloat(b.val()):0,repair:y.val()?parseFloat(y.val()):0,annual_survey:S.val()?parseFloat(S.val()):0,salary:k.val()?parseFloat(k.val()):0,oil:E.val()?parseFloat(E.val()):0,toll:_.val()?parseFloat(_.val()):0,fine:H.val()?parseFloat(H.val()):0,other:w.val()?parseFloat(w.val()):0,total:x.val(),month:R,vv_type:M?"che":"chuan"};ajaxRequestHandle("/one_vessel_fixed_cost","POST",t,"数据保存",function(){$("#data-dialog").modal("hide");var e=!1;"ADD"===L?(e=B.addData(t))&&M&&(C.indexOf(t.name)<0&&C.push(t.name),a.vehicles.indexOf(t.name)<0&&l.append("<option value='"+t.name+"'>"+t.name+"</option>"),l.select2("val",C)):"UPDATE"===L&&(e=B.updateData(t)),e&&B.show(Q)})}),elementEventRegister(Y,"click",function(){L="UPDATE";var e=B.getSelectedData();if(e){R=e.month,f.val(e.month),setHtmlElementDisabled(f,!0),M?(m.select2().select2("val",e.name),m.select2("disable"),b.val(e.fittings),y.val(e.repair),S.val(e.annual_survey),k.val(e.salary),E.val(e.oil),_.val(e.toll),H.val(e.fine)):(p.val(e.ic),g.val(e.hc),D.val(e.pcc),V.val(e.aux)),w.val(e.other),x.val(e.total);var t=getDateTimePickerOptions();t.minViewMode="months",t.format="YYYY-MM",u.datetimepicker(t).on("dp.change",A),$("#data-dialog").modal({backdrop:"static",keyboard:!1}).modal("show")}else bootbox.alert("请先选择一行")}),elementEventRegister(T,"click",function(){var a=B.getSelectedData();a?ajaxRequestHandle("/delete_vfc_data","POST",a,"数据删除",function(){if(B.removeData(a.name,a.month)&&(B.show(Q),M&&!B.isExistSameName(a.name))){var e="option[value='"+a.name+"']";l.find(e).remove();var t=C.indexOf(a.name);0<=t&&(C.remove(t),C.length?l.select2("val",C):l.select2("val",""))}}):bootbox.alert("请先选择一行")}),elementEventRegister(F,"click",function(){B.exportExcel()})});var TableHandler={createNew:function(e){var V=-1,t={vehTable:$("#vehicle-table"),vesTable:$("#vessel-table"),vehicleBody:$("#vehicle-tbody"),vesselBody:$("#vessel-tbody"),isVehicle:e,vvData:[],show:function(l){V=-1;var e=this,n=e.isVehicle?e.vehicleBody:e.vesselBody;if(n.empty(),e.vvData.length){var t="";if(e.isVehicle){var a=0,i=0,o=0,r=0,s=0,v=0,c=0,d=0,h=0;t="<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td></tr>",e.vvData.forEach(function(e){"che"===e.vv_type&&(n.append(t.format(e.month,e.name,getStrValue(e.fittings),getStrValue(e.repair),getStrValue(e.annual_survey),getStrValue(e.salary),getStrValue(e.oil),getStrValue(e.toll),getStrValue(e.fine),getStrValue(e.other),getStrValue(e.total))),a+=e.fittings,i+=e.repair,o+=e.annual_survey,r+=e.salary,s+=e.oil,v+=e.toll,c+=e.fine,d+=e.other,h+=e.total)}),n.append(t.format("合计","",getStrValue(a),getStrValue(i),getStrValue(o),getStrValue(r),getStrValue(s),getStrValue(v),getStrValue(c),getStrValue(d),getStrValue(h)))}else{t="<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td></tr>";var m=0,u=0,f=0,p=0,g=0,D=0;e.vvData.forEach(function(e){"chuan"===e.vv_type&&(n.append(t.format(e.month,getStrValue(e.ic),getStrValue(e.hc),getStrValue(e.pcc),getStrValue(e.aux),getStrValue(e.other),getStrValue(e.total))),m+=e.ic,u+=e.hc,f+=e.pcc,p+=e.aux,g+=e.other,D+=e.total)}),n.append(t.format("合计",getStrValue(m),getStrValue(u),getStrValue(f),getStrValue(p),getStrValue(g),getStrValue(D)))}tr_click(n.find("tr"),function(e,t){var a=n.find("tr").length;l(V=t!==a-1?t:-1)})}else l(V=-1)},setVVData:function(e){this.vvData=e},addData:function(e){for(var t=!1,a=0;a<this.vvData.length;++a)if(this.vvData[a].name===e.name&&this.vvData[a].month===e.month){t=!0;break}return t?bootbox.alert("已存在相同的记录: 车船名 = "+e.name+" 月份 = "+e.month):this.vvData.unshift(e),!t},removeData:function(e,t){for(var a=!1,l=0;l<this.vvData.length;++l)if(this.vvData[l].name===e&&this.vvData[l].month===t){this.vvData.remove(l),a=!0;break}return a},updateData:function(e){for(var t=this,a=!1,l=0;l<t.vvData.length;++l)if(t.vvData[l].name===e.name&&t.vvData[l].month===e.month){t.vvData[l].ic=e.ic,t.vvData[l].hc=e.hc,t.vvData[l].pcc=e.pcc,t.vvData[l].aux=e.aux,t.vvData[l].fittings=e.fittings,t.vvData[l].repair=e.repair,t.vvData[l].annual_survey=e.annual_survey,t.vvData[l].salary=e.salary,t.vvData[l].oil=e.oil,t.vvData[l].toll=e.toll,t.vvData[l].fine=e.fine,t.vvData[l].other=e.other,t.vvData[l].total=e.total,a=!0;break}return a},getSelectedData:function(){return this.vvData[V]},isExistSameName:function(e){var t=!1;if(this.vvData.length)for(var a=this.isVehicle?"che":"chuan",l=0;l<this.vvData.length;++l){var n=this.vvData[l];if(n.vv_type===a&&n.name===e){t=!0;break}}return t},setVehileFlag:function(e){this.isVehicle=e},exportExcel:function(){var e=!1;if(this.vvData.length)for(var t=this.isVehicle?"che":"chuan",a=0;a<this.vvData.length;++a)if(this.vvData[a].vv_type===t){e=!0;break}if(e){var l=this.isVehicle?this.vehTable:this.vesTable;tableToExcel(l.html(),"data")}}};return t}};
//# sourceMappingURL=vehves_cost_mgt.js.map
