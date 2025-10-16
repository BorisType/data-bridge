import { Library } from "./prelude";

export namespace DataBridge {
  export const LOG_CODE = 'DataBridge';
  let libraryInstance: Library;

  /**
   * Инициализация библиотеки, не использовать напрямую!
   */
  export function init(): void {
    libraryInstance = OpenCodeLibrary<Library>("main/library.js");
    libraryInstance.init();
  }

  /**
   * Загружает объекты из указанной директории
   * @param dataDirectoryUrl - директория с файлами объектов
   */
  export function loadObjects(dataDirectoryUrl: string): void {
    libraryInstance.loadObjects(dataDirectoryUrl);
  }
}