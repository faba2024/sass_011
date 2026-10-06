// Permite que os testes unitários importem os módulos de src/lib (TypeScript, imports sem extensão e alias "@/")
import { register } from "node:module";
register("./resolve-ts.mjs", import.meta.url);
