# PlayCanvas API Reference

This repository builds the [PlayCanvas API Reference](https://api.playcanvas.com/). It is built using [TypeDoc](https://typedoc.org/).

## Installation

Ensure you have Node.js 18+ installed.

    npm install

## Building

To build the API reference manual locally, run:

    npm run build

The manual will be output to the `docs` folder.

## Viewing

To view the build manual, run:

    npm run serve

Then point your browser at `http://localhost:3000`.

## Updating Submodules

To update any of the submodules to latest commit of the `main` branch, do:

    cd submodules
    cd engine (or pcui, pcui-graph, etc)
    git pull origin main
    cd ..
    cd ..
    git add submodules
    git commit -m "Updated submodule X to latest"

## Deployment

The API reference is automatically deployed to GitHub Pages whenever the main branch is updated.
