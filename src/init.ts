/// @xml-init
import { DataBridge } from ".";

var LOG_CODE = 'DataBridge';


EnableLog(LOG_CODE, true);
try {
    RegisterCodeLibrary('./index.js');

    DataBridge.init();
    LogEvent(LOG_CODE, 'INFO:     DataBridge module registration success');
} catch (err) {
    LogEvent(LOG_CODE, 'ERROR:    DataBridge module registration failed: ' + err);
    alert('[DataBridge]  ERROR:     DataBridge module registration failed: ' + err);
}