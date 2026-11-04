import { texturePacker } from "@assetpack/core/texture-packer";

/** @type {import("@assetpack/core").AssetPackConfig} */
export default {
  entry: "./assets",
  output: "./public/assets",
  strict: true,
  pipes: [
    texturePacker({
      texturePacker: {
        nameStyle: "short",
        removeFileExtension: false,
        allowTrim: false,
        allowRotation: false,
        autodetectAnimations: false,
        padding: 4,
      },
      resolutionOptions: {
        resolutions: { default: 2 },
        maximumTextureSize: 2048,
      },
    }),
  ],
};
