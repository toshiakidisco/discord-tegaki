export interface IFSubject {
  addObserver(observer: Object, name: string, callback: Function): void;
  removeObserver(observer: Object, name?: string, callback?: Function): boolean;
  notify(name: string, data?: any): void;
}

export default class Subject implements IFSubject {
  #registers: Map<string, {observer: Object, callback: Function}[]> = new Map();

  /**
   * Subscribe notification
   * @param observer
   * @param name Notification name
   * @param callback
   */
  addObserver(observer: Object, name: string, callback: Function) {
    let register = this.#registers.get(name);
    if (typeof register === "undefined") {
      register = [];
      this.#registers.set(name, register);
    }
    register.push({observer, callback});
  }

  /**
   * Unsubscribe notification
   * @param observer
   * @param name
   * @param callback
   * @returns 
   */
  removeObserver(
      observer: Object,
      name?: string,
      callback?: Function
  ): boolean {
    if (typeof name == "undefined") {
      return this.#removeObserver(observer);
    }
    if (typeof callback == "undefined") {
      return this.#removeObserverName(observer, name);
    }
    return this.#removeObserverNameCallback(observer, name, callback);
  }

  #removeObserver(observer: Object): boolean {
    let result = false;
    for (let name of this.#registers.keys()) {
      result = this.#removeObserverName(observer, name) || result;
    }
    return result;
  }

  #removeObserverName(observer: Object, name: string): boolean {
    const registersForName = this.#registers.get(name);
    if (! registersForName) {
      return false;
    }

    let result = false;
    for (let i = 0; i < registersForName.length; i++) {
      const register = registersForName[i];
      if (register.observer != observer) {
        continue;
      }
      result = true;
      registersForName.splice(i, 1);
      i--;
    }
    return result;
  }

  #removeObserverNameCallback(observer: Object, name: string, callback: Function): boolean {
    const registersForName = this.#registers.get(name);
    if (! registersForName) {
      return false;
    }

    for (let i = 0; i < registersForName.length; i++) {
      const register = registersForName[i];
      if (register.observer != observer || register.callback == callback) {
        continue;
      }
      registersForName.splice(i, 1);
      return true;
    }
    return false;
  }

  /**
   * Send notification
   * @param name Notification name
   * @param data
   * @returns 
   */
  notify(name: string, data?: any) {
    const registersForName = this.#registers.get(name);
    if (! registersForName) {
      return;
    }

    for (let register of registersForName) {
      register.callback.call(register.observer, data);
    }
  }
}
