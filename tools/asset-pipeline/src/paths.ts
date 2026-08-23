import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const paths = {
  root,
  source: path.join(root, "assets/source"),
  processed: path.join(root, "assets/processed"),
  atlases: path.join(root, "assets/atlases"),
  audio: path.join(root, "assets/audio"),
  fonts: path.join(root, "assets/fonts"),
  clientPublic: path.join(root, "apps/client/public"),
  clientAssets: path.join(root, "apps/client/public/assets"),
};
