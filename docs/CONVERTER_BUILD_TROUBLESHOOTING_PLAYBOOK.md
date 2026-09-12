# ConvertFileType Converter Build & Troubleshooting Playbook

## Purpose

Use this playbook for every new ConvertFileType converter.

A converter is not finished because its UI loads. It is finished when a real fixture converts successfully in a production-like browser and the downloaded output is verified.

## 1. Default architecture

- Process files entirely in the browser whenever practical.
- Do not upload user files to ConvertFileType servers.
- Self-host conversion libraries, workers, WASM, decoder assets, and encoder assets.
- Serve runtime dependencies from the same origin.
- Avoid CDN runtime dependencies.
- Avoid inline JavaScript.
- Keep startup code compatible with the production Content Security Policy.
- Keep ad and analytics code separate from conversion code.

## 2. Start with a real fixture

Before building a converter, obtain at least one real input file.

Record:

- fixture filename
- actual source format
- file size
- expected output format
- expected dimensions, duration, page count, or other relevant properties
- orientation or metadata requirements

Do not test only with synthetic files or files renamed to another extension.

## 3. Define success before coding

For an image converter, require:

- real fixture loads
- decoder/encoder initializes
- conversion completes
- output MIME/type is correct
- output is non-empty
- output can be decoded again
- dimensions are valid
- preview displays
- download works
- extension is correct
- conversion meets its performance target
- no site-origin console errors
- no forbidden third-party codec requests

For an ordinary image fixture, target roughly under 10 seconds on a normal desktop unless the format requires a different target.

## 4. Prove the engine first

Prove this path before spending much time on UI:

`real input → decoder → internal representation → encoder → verified output`

Then add progress UI, previews, controls, SEO content, ads, and polish.

## 5. Runtime asset rules

If the converter needs JS, WASM, a worker, codec data, or another runtime asset:

- package it with the site
- serve it from ConvertFileType's origin
- use explicit asset paths
- verify each asset returns successfully
- verify WASM is served correctly
- verify module imports resolve after Cloudflare deployment
- verify worker URLs resolve

Do not make conversion depend on jsDelivr, unpkg, or another public package CDN.

## 6. CSP checks

Production can behave differently from local development.

Check:

- no required inline script
- no `eval()` dependency
- no blocked module import
- no blocked worker
- no blocked WASM initialization
- no forbidden third-party request

Prefer same-origin external modules for startup code.

A `Decoder unavailable` message can mean startup code never ran. Do not assume the decoder library itself is bad.

## 7. Track real readiness

Track explicit states:

1. loading engine
2. engine ready
3. reading file
4. decoding
5. encoding
6. creating output
7. verifying output
8. complete
9. failed

QA diagnostics should identify the real failing stage, such as:

- module import failed
- WASM fetch failed
- WASM initialization failed
- worker startup failed
- decoder startup was not created
- unsupported source
- encoding failed

## 8. Progress must represent real work

Do not use simulated progress as evidence of successful processing.

If the library cannot report granular percentages, show stage labels such as:

`Loading decoder…`
`Reading file…`
`Decoding…`
`Encoding…`
`Verifying output…`

A real stage is better than a fake percentage.

## 9. Never show false success

On any failure or timeout:

- remove the preview
- remove the ready message
- remove or disable download
- revoke stale object URLs
- clear previous output state
- show only the failure and recovery action

Never display a failure and `Your file is ready` at the same time.

## 10. Verify output

A resolved promise is not enough.

For images verify:

- Blob exists
- Blob size is greater than zero
- expected MIME type
- browser can decode output
- width is greater than zero
- height is greater than zero
- file signature when practical

Create equivalent validation for other formats.

PDF:
- valid PDF signature
- non-empty output
- expected page count when known

Audio/video:
- non-empty output
- expected type/container
- metadata loads
- valid duration
- valid dimensions for video

Documents/text:
- output parses or opens
- expected content is present

## 11. Timeouts

Do not repeatedly increase timeouts to hide a broken engine.

When conversion is slow, measure:

- asset loading
- initialization
- decoding
- encoding
- output creation
- verification

Increase a timeout only when measurements show valid files genuinely require it.

## 12. Release gates

Every converter should have both a repository/static gate and a real browser gate.

### Repository/static gate

Check:

- required files exist
- expected build marker exists
- no forbidden CDN runtime dependency
- no prohibited inline startup script
- self-hosted assets exist
- converter route exists

### Browser gate

Use the real fixture and require:

- page loads
- engine becomes ready
- fixture is selected
- conversion starts
- conversion completes within target
- output exists
- output type is correct
- output properties validate
- download appears only after success
- no site-origin console errors
- no codec requests to forbidden third-party hosts

If this gate fails, do not merge.

## 13. Test the Cloudflare preview

The PR preview should be tested with the real fixture when practical.

This catches:

- CSP differences
- bad asset paths
- case-sensitive path errors
- missing assets
- WASM issues
- module loading failures
- Cloudflare-specific behavior

Flow:

`branch → code → gates → Cloudflare preview → real fixture → green → merge`

## 14. Production QA

After merge:

1. Confirm Cloudflare deployed the expected main commit.
2. Hard refresh production.
3. Confirm the expected converter build marker.
4. Use the same real fixture as the gate.
5. Convert through normal user controls.
6. Verify the preview/output.
7. Download the result.
8. Open the downloaded file.
9. Confirm its properties.
10. Check visible errors and site-origin console errors.

CI alone does not close a converter.

## 15. Build markers

Give meaningful engine revisions a QA-readable build marker.

Example:

`heic-v14-csp-safe`

Use it to determine whether QA is testing the intended deployment rather than cached or older code.

## 16. Failure triage order

### A. Confirm deployed build
Verify commit and build marker.

### B. Confirm runtime assets
Check JS, WASM, worker, and codec files.

### C. Check CSP and console
Look for blocked scripts, workers, WASM, imports, and connections.

### D. Confirm engine initialization
Verify the decoder/encoder becomes ready.

### E. Run the exact known-good fixture
Capture the actual failing stage.

### F. Confirm source support
Verify the input is truly the expected format.

### G. Measure stages separately
Find whether decode, encode, initialization, or output verification is slow.

### H. Verify output independently
Do not trust UI state alone.

## 17. Common failure patterns

### Decoder unavailable

Check:

- startup module execution
- import path
- WASM path
- CSP
- worker path
- readiness promise/global creation
- asset HTTP status
- module exceptions

### Conversion hangs

Check:

- promise that never settles
- worker failure
- unsupported codec profile
- extreme dimensions
- memory pressure
- encoding stage
- stale UI waiting on the wrong operation

### Works locally but fails on Cloudflare

Check:

- CSP
- path case
- absolute vs relative paths
- missing committed assets
- WASM handling
- production base path
- worker/module URLs

### Complete state with broken preview

Check:

- Blob validity
- MIME type
- object URL
- actual output decoding
- stale result from a previous conversion

### CI passes but production fails

Strengthen the gate to reproduce the production failure using the real fixture, real browser, deployed preview, and real runtime assets.

## 18. Branch and PR workflow

Use one focused branch per converter or repair.

Examples:

`feature/png-to-jpg-v1`

`fix/png-to-jpg-decoder-v2`

Keep related fixes on the existing PR while the converter remains unfinished.

Do not merge just to see whether production works.

Required flow:

`branch → implement → release gate → browser fixture gate → preview validation → PR green → merge → Cloudflare production → production QA`

## 19. Definition of done

A converter is done only when:

- [ ] real fixture converts
- [ ] output type is correct
- [ ] output independently validates
- [ ] download works
- [ ] preview works when applicable
- [ ] failures cannot show stale success
- [ ] client-side processing confirmed
- [ ] required codec assets are self-hosted
- [ ] no forbidden codec CDN requests
- [ ] CSP compatible
- [ ] performance target passes
- [ ] repository gate passes
- [ ] browser fixture gate passes
- [ ] Cloudflare preview passes
- [ ] production matches expected commit/build
- [ ] production fixture test passes
- [ ] no site-origin console errors

Do not start the next converter until these checks pass.

## 20. New converter template

### Converter

`SOURCE → TARGET`

### Route

`/source-to-target/`

### Real fixture

- Filename:
- Size:
- Source:
- Expected properties:

### Engine

- Browser-native capability:
- Decoder:
- Encoder:
- JS/WASM/worker assets:
- Self-hosted:

### Acceptance target

- Maximum fixture conversion time:
- Expected output MIME/type:
- Required output validation:

### Browser gate

- Real fixture:
- Output validation:
- Network dependency check:
- Console error check:
- Performance check:

### Production QA

- Expected build marker:
- Fixture:
- Expected result:

## Core rule

Do not debug converters by repeatedly changing production and hoping.

Reproduce the problem with a real fixture. Make the automated browser gate catch it. Fix the root cause. Prove the deployed preview works. Then merge.
