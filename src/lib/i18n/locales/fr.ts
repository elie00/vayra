import frCore from "./fr-core";
import frExtended from "./fr-extended";

const fr: Record<string, string> = {
  ...frExtended,
  ...frCore,
};

export default fr;
