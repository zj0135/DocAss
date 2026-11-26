# OCR dependencies

The following unmodified libraries and embedded model resources are distributed with DocAss under Apache License 2.0 (see Apache-2.0.txt):

| Package | Version | Author |
|---|---|---|
| Sdcb.SimdPaddleOCR | 2.0.0 | sdcb |
| Sdcb.SimdPaddleOCR.ModelProvider | 1.0.0 | sdcb |
| Sdcb.SimdPaddleOCR.Models.ChineseV6Tiny | 1.0.0 | sdcb |
| Sdcb.SimdPaddleOCR.Models.ChineseV6Small | 1.0.0 | sdcb |
| Sdcb.SimdPaddleOCR.Models.ChineseV6Medium | 1.0.0 | sdcb |
| Sdcb.SimdPaddleOCR.Models.TextLineOrientation | 1.0.0 | sdcb |

Upstream: https://github.com/sdcb/SimdPaddleOCR

Engine package source commit: 697208399240f21ec8ff28218fc8cd2c4dbbe0ee. Model package source commit: 315e4fff4466260fd8f09cd4d53a70ec3b63f65c.

Models implement PP-OCRv6 Chinese text detection and recognition and text line orientation. Model resources remain in their original assemblies; package content hashes are pinned in packages.lock.json. Runtime cache fingerprints include hashes of the embedded model resources and the orientation model. NuGet package metadata declares Apache-2.0 for each package listed above.

DocAss uses the original CTC character alignment estimates and marks their page geometry approximate. It does not interpret the original recognition score as a calibrated probability.
