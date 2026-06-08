import { type Carrier } from "../core/interfaces";

interface CarrierRegistry<T extends Carrier = Carrier> {
  get: (carrierId: string) => T | null;
  get carriers(): T[];
}

export { type CarrierRegistry };
