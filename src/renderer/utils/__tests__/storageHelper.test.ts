import { reaction } from "mobx";
import { StorageAdapter, StorageHelper } from "../storageHelper";
import { delay } from "../../../common/utils/delay";

describe("renderer/utils/StorageHelper", () => {
  describe("window.localStorage might be used as StorageAdapter", () => {
    type StorageModel = string;

    const storageKey = "ui-settings";
    let storageHelper: StorageHelper<StorageModel>;

    beforeEach(() => {
      localStorage.clear();

      storageHelper = new StorageHelper<StorageModel>(storageKey, {
        autoInit: false,
        storage: localStorage,
        defaultValue: "test",
      });
    });

    it("initialized with default value", async () => {
      localStorage.setItem(storageKey, "saved"); // pretending it was saved previously

      expect(storageHelper.key).toBe(storageKey);
      expect(storageHelper.defaultValue).toBe("test");
      expect(storageHelper.get()).toBe("test");

      await storageHelper.init();

      expect(storageHelper.key).toBe(storageKey);
      expect(storageHelper.defaultValue).toBe("test");
      expect(storageHelper.get()).toBe("saved");
    });

    it("updates storage", async () => {
      storageHelper.init();

      storageHelper.set("test2");
      expect(localStorage.getItem(storageKey)).toBe("test2");

      localStorage.setItem(storageKey, "test3");
      storageHelper.init({ force: true }); // reload from underlying storage and merge
      expect(storageHelper.get()).toBe("test3");
    });
  });

  describe("Using custom StorageAdapter", () => {
    type SettingsStorageModel = {
      [key: string]: any;
      message: string;
    };

    const storageKey = "mySettings";
    const storageMock: Record<string, any> = {};
    let storageHelper: StorageHelper<SettingsStorageModel>;
    let storageHelperAsync: StorageHelper<SettingsStorageModel>;
    let storageAdapter: StorageAdapter<SettingsStorageModel>;

    const storageHelperDefaultValue: SettingsStorageModel = {
      message: "hello-world",
      anyOtherStorableData: 123,
    };

    beforeEach(() => {
      storageMock[storageKey] = {
        message: "saved-before",
      } as SettingsStorageModel;

      storageAdapter = {
        onChange: jest.fn(),
        getItem: jest.fn((key: string) => {
          return storageMock[key];
        }),
        setItem: jest.fn((key: string, value: any) => {
          storageMock[key] = value;
        }),
        removeItem: jest.fn((key: string) => {
          delete storageMock[key];
        }),
      };

      storageHelper = new StorageHelper(storageKey, {
        autoInit: false,
        defaultValue: storageHelperDefaultValue,
        storage: storageAdapter,
      });

      storageHelperAsync = new StorageHelper(storageKey, {
        autoInit: false,
        defaultValue: storageHelperDefaultValue,
        storage: {
          ...storageAdapter,
          async getItem(key: string): Promise<SettingsStorageModel> {
            await delay(500); // fake loading timeout

            return storageAdapter.getItem(key);
          }
        },
      });
    });

    it("loads data from storage with fallback to default-value", () => {
      expect(storageHelper.get()).toEqual(storageHelperDefaultValue);
      storageHelper.init();

      expect(storageHelper.get().message).toBe("saved-before");
      expect(storageAdapter.getItem).toHaveBeenCalledWith(storageHelper.key);
    });

    it("async loading from storage supported too", async () => {
      expect(storageHelperAsync.initialized).toBeFalsy();
      storageHelperAsync.init();
      await delay(300);
      expect(storageHelperAsync.get()).toEqual(storageHelperDefaultValue);
      await delay(200);
      expect(storageHelperAsync.get().message).toBe("saved-before");
    });

    it("set() fully replaces data in storage", () => {
      storageHelper.init();
      storageHelper.set({ message: "test2" });
      expect(storageHelper.get().message).toBe("test2");
      expect(storageMock[storageKey]).toEqual({ message: "test2" });
      expect(storageAdapter.setItem).toHaveBeenCalledWith(storageHelper.key, { message: "test2" });
    });

    it("merge() does partial data tree updates", () => {
      storageHelper.init();
      storageHelper.merge({ message: "updated" });

      expect(storageHelper.get()).toEqual({ ...storageHelperDefaultValue, message: "updated" });
      expect(storageAdapter.setItem).toHaveBeenCalledWith(storageHelper.key, { ...storageHelperDefaultValue, message: "updated" });

      storageHelper.merge(draft => {
        draft.message = "updated2";
      });
      expect(storageHelper.get()).toEqual({ ...storageHelperDefaultValue, message: "updated2" });

      storageHelper.merge(draft => ({
        message: draft.message.replace("2", "3")
      }));
      expect(storageHelper.get()).toEqual({ ...storageHelperDefaultValue, message: "updated3" });
    });

    it("clears data in storage", () => {
      storageHelper.init();

      expect(storageHelper.get()).toBeTruthy();
      storageHelper.clear();
      expect(storageHelper.get()).toBeFalsy();
      expect(storageMock[storageKey]).toBeUndefined();
      expect(storageAdapter.removeItem).toHaveBeenCalledWith(storageHelper.key);
    });

  });

  describe("data in storage-helper is observable (mobx)", () => {
    let storageHelper: StorageHelper<any>;
    const defaultValue: any = { firstName: "Joe" };
    const observedChanges: any[] = [];

    beforeEach(() => {
      observedChanges.length = 0;

      storageHelper = new StorageHelper<typeof defaultValue>("some-key", {
        autoInit: true,
        defaultValue,
        storage: {
          getItem: jest.fn(),
          setItem: jest.fn(),
          removeItem: jest.fn(),
        },
      });
    });

    it("storage.get() is observable", () => {
      expect(storageHelper.get()).toEqual(defaultValue);

      reaction(() => storageHelper.toJS(), change => {
        observedChanges.push(change);
      });

      storageHelper.merge({ lastName: "Black" });
      storageHelper.set("whatever");
      expect(observedChanges).toEqual([{ ...defaultValue, lastName: "Black" }, "whatever",]);
    });
  });

});
