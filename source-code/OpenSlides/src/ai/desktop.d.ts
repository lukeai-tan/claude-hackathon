export {};
declare global {
  interface Window {
    deckforgeDesktop?: {
      suiteMode?: boolean;
      openSuiteHome?: () => Promise<void>;
      keyStatus():Promise<{configured:boolean;encrypted:boolean}>;
      setKey(key:string,remember:boolean):Promise<void>;
      request(id:string,body:unknown,version:string):Promise<{ok:boolean;status:number;data:unknown;error?:string}>;
      cancel(id:string):Promise<void>;
      version:string;
    };
  }
}
