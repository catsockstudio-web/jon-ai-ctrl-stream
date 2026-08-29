# Presets

A preset is a `channel` block plus any theme choices, pre-loaded into a build
so a customer's package arrives already wearing their name instead of the
demo copy.

It is only data. There is no forked code, no second branch, and nothing here
can change behaviour — which is the point: a fix made once reaches every
preset, and a customer's build is reproducible from this repo rather than
from a zip somebody kept.

    node tools/build-client-package.mjs                  # demo copy (the product)
    node tools/build-client-package.mjs --preset jon     # Jon's build

Everything in a preset is editable from the dashboard afterwards. A preset is
a starting point, not a lock.
