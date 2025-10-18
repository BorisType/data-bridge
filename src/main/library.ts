import { DataBridge } from "..";

let regexp: Websoft.RegExp.RegExp;

type ObjectInfo = {
    proper: XmlDocument;
    concise: XmlDocument;
};

export function init() {
    regexp = tools_web.reg_exp_init();
    regexp.Global = true;
    regexp.Pattern = `(\\s*SPXML-FORM="([^"]+)"\\s*)`;
}

export function loadObjects(dataDirectory: string) {
    Array.from([1123]);

    const dataFileUrls = ReadDirectory(dataDirectory);

    for (const dirObjectKind of dataFileUrls) {
        try {
            if (!IsDirectory(dirObjectKind)) {
                // В директории data должны находиться только папки по типу объектов,
                // на данный момент такой дизайн не реализован
                warning(`Dir "${dirObjectKind}" is not a valid object kind directory`);
                continue;
            }

            const objectFileUrls = ReadDirectory(dirObjectKind);
            for (const objectFileUrl of objectFileUrls) {
                if (IsDirectory(objectFileUrl)) {
                    // Вложенные папки не поддерживаются по структуре
                    warning(`Skipping nested directory "${objectFileUrl}"`);
                    continue;
                }

                const objectFileName = UrlFileName(objectFileUrl);
                const objectFileExt = UrlPathSuffix(objectFileUrl);

                if (StrLowerCase(objectFileExt) !== ".xml") {
                    warning(`Skipping non-XML file "${objectFileName}"`);
                    continue;
                }

                const objectName = StrLeftCharRange(objectFileName, StrCharCount(objectFileName) - StrCharCount(objectFileExt));

                try {
                    const object = openObjectFromUrl(objectFileUrl);
                    applyObject(object);
                } catch (err) {
                    error(`Object "${objectName}" could not be loaded: ${err}`);
                    continue;
                }
            }

            debug(`Dir "${dirObjectKind}" successfully loaded`);
        } catch (err) {
            error(`Dir "${dirObjectKind}" could not be loaded: ${err}`);
        }
    }
}

function openObjectFromUrl(objectUrl: string): ObjectInfo {
    const objectData = LoadUrlText(objectUrl, { DetectContentCharset: true });
    const objectFields = objectDataWithoutForm(objectData);

    const proper = OpenDocFromStr(objectData);
    const concise = OpenDocFromStr(objectFields);

    return {
        proper,
        concise,
    };
}

function objectDataWithoutForm(content: string): string {
    const matches = regexp.Execute(content);

    if (matches.Count == 0) {
        throw "Incorrect object format: SPXML-FORM attribute not found";
    }

    const fullMatch = matches.Item(0);
    const toRemove = fullMatch.SubMatches(0);

    return StrReplaceOne(content, toRemove, "");
}

function applyObject(object: ObjectInfo) {
    const sourceObjectTe = object.proper.TopElem;
    const fieldsObjectTe = object.concise.TopElem;

    const objectId = OptInt(sourceObjectTe.OptChild<XmlElem<string>>("id")?.Value);

    if (objectId === undefined) {
        error("Object ID is not defined");
        return;
    }

    const targetObjectDoc = tools.open_doc(objectId);

    if (targetObjectDoc === undefined) {
        object.proper.Url = UrlFromDocID(objectId)
        object.proper.Save();
        debug(`Object "${objectId}" has been created`);
        return;
    }

    const copyContext = { changed: false };
    const targetObjectTe = targetObjectDoc.TopElem;
    deepCopyXmlTo(targetObjectTe, sourceObjectTe, fieldsObjectTe, copyContext);

    if (copyContext.changed) {
        targetObjectDoc.Save();
        debug(`Object "${objectId}" has been updated`);
    }
}

function deepCopyXmlTo(
    target: XmlElem<unknown>,
    source: XmlElem<unknown>,
    fields: XmlElem<unknown>,
    context: { changed: boolean },
): boolean {
    let isComplexField = false;
    let multiElemCounter = 0;
    let multiElemOffset = 0;
    let noPrimaryKeyMultiElem = false;

    for (const child of fields) {
        isComplexField = true;

        const field = child;
        const fieldName = field.Name;

        const flagValueByDefault = RValue(field.Attr("default")) === "true";

        // Получаем поле из источника по имени, мы не можем получить его по индексу, потому что
        // в источнике находится перечисление всех полей по xmd-форме а мы перебираем только указанные в файле,
        // поэтому индексы не будут совпадать
        let sourceField = source.Child(fieldName);
        let targetField: XmlElem<unknown> | undefined;

        if (sourceField.FormElem.IsMultiple) {
            // Это поле является элементом массива

            const multiElemIndex = multiElemCounter++;
            multiElemOffset = sourceField.ChildIndex;
            const itemActualIndex = multiElemIndex + multiElemOffset;

            debug(`Field "${fieldName}+${multiElemIndex}" is an item of array. Processing...`);

            // Получаем текущий элемент внутри элемента-массива, потому что полученный ранее элемент
            // с помощью имени будет всегда указывать на первый элемент массива
            // но это будет работать только элементов внутри изолированного массива
            // например, для role_id[] который находится внутри TopElem вместе с уникальными полями
            // такой подход может не всегда работать исправно, но кажется это все-таки работает
            sourceField = source.Child(itemActualIndex);
            if (sourceField.Name !== fieldName) {
                // Вообще не понятно как сюда можно попасть и что с этим делать
                warning(`Field "${fieldName}" found as ${sourceField.Name} in source object. Skipping...`);
                continue;
            }

            // Нам нужно получить ключ по которому мы будем идентифицировать элементы в массиве если это не простой массив
            // Если ключа нет, то мы не сможем корректно обновить элементы в массиве, а значит будем очищать массив и заполнять его заново
            const primaryKeyValue = sourceField.PrimaryKey !== sourceField ? sourceField.PrimaryKey : undefined;
            debug(`Primary key value: ${primaryKeyValue}`);

            if (primaryKeyValue === undefined) {
                if (!noPrimaryKeyMultiElem) {
                    // Мы впервые столкнулись с таким массивом, значит нужно очистить его
                    debug(`Field "${fieldName}" has no primary key. Clearing target array...`);
                    noPrimaryKeyMultiElem = true;

                    const elemsToRemove: XmElem<unknown, never>[] = [];

                    for (const toRemove of target) {
                        if (toRemove.Name === fieldName) {
                            elemsToRemove.push(toRemove);
                        }
                    }

                    for (const toRemove of elemsToRemove) {
                        toRemove.Delete();
                    }
                }

                const targetElemForm = source.Child(fieldName).FormElem;
                const targetNewElem = CreateElemByFormElem(targetElemForm);
                target.AddChildElem(targetNewElem)

                debug(`Creating new item`);
                targetField = targetNewElem;
            } else {
                if (noPrimaryKeyMultiElem) {
                    // Мы вышли из массива без ключей, значит нужно сбросить флаг
                    debug(`Release noPrimaryKey mode on "${fieldName}" field`);
                    noPrimaryKeyMultiElem = false;
                }

                targetField = target.GetOptChildByKey(primaryKeyValue);
                if (targetField === undefined) {
                    // Если в целевом документе нет элемента с таким ключом, то создаем новый
                    debug(`Creating new item`);
                    targetField = (target as XmlMultiElem<unknown>).Add();
                }
            }
        } else {
            // Это обычное именнованное поле, работает без всяких заморочек

            debug(`Field "${fieldName}" is ordinary field. Processing...`);
            targetField = target.OptChild(fieldName);
        }

        if (targetField === undefined) {
            warning(`Field "${fieldName}" not found in target object. Skipping...`);
            continue;
        }

        // Пытаемся скопировать значения если это сложное поле, если нет, то идем дальше
        if (deepCopyXmlTo(targetField, sourceField, field, context)) {
            continue;
        }

        // Если для поля значение указано как значение по умолчанию и целевое поле уже имеет значение, то пропускаем установку значения
        if (flagValueByDefault && targetField.Value !== null) {
            continue;
        }

        // Только сейчас можем установить значение примитивного поля
        if (targetField.Value !== field.Value) {
            targetField.Value = field.Value;
            context.changed = true;
        }
    }

    // возвращаем признак является ли текущее поле составным
    return isComplexField;
}


function debug(message: string) {
    LogEvent(DataBridge.LOG_CODE, `DEBUG:    ${message}`);
}

function info(message: string) {
    LogEvent(DataBridge.LOG_CODE, `INFO:     ${message}`);
}

function warning(message: string) {
    LogEvent(DataBridge.LOG_CODE, `WARNING:  ${message}`);
}

function error(message: string) {
    LogEvent(DataBridge.LOG_CODE, `ERROR:    ${message}`);
}
