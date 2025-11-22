# Deadlock Stats Editor
This is a comprehensive editor of item, ability and hero stats for Valve's third-person MOBA shooter Deadlock. Originally indended as a simple ability randomizer, I decided it's best to evolve it into something more sophisticated.

The goal is to build an accessible editor, for people to be able to create their own balance mods without requiring the technical know-how to edit and compile vdata directly.

## Disclaimer: Community SDK 12
<details>
  <summary>Click to expand</summary>

  This project ships with binaries of the [Community SDK project](https://deadlockmodding.pages.dev/modding-tools/csdk-12). This is absolutely necessary to compile the relevant resources and the sole reason why the releases are so large.

**I am not and do not claim to be the author of these development tools. They are provided without warranty.** The following is the explanation that the person who assembled these tools gave to me when prompted about how they were made:

> With how close both versions were Build citadel 10524 and CS2 10521 (Shader VCS 70)
> It's was mostly a drag and drop from citadel to CS2 (excluding few dll's like resourcerecomplier to allow file saving / cherry picking trial and error)
> This allowed server mode with limited tools (hammer/material editor)
> 
> But to get into all tools ( Lose server mode with mismatch errors)
> Cs2 Dlls:
> 
> ```
> AnimationSystem
> AssetPreview
> MeshSystem
> Particles
> Vphysics2
> ```
> 
> Believe it's down to Tier0 and Vphysics2 that could hold the key to full access with server mode
> Checking the call functions only a few match up while others are offset by a small margin
> Other is replacing strings that have "_Legacy" to remove any remaining error mismatches between client/server.dll.
> 
> ----------
> 
> The other method is using as little as possible from Citadel (No errors + Tools but no server , SFM would need Citadel "Particles" to work properly)
> ```
> Deadlock.exe
> Engine2
> Materialsystem2
> Panorama
> Panorama_text_pango
> Panoramauiclient
> Rendersystemdx11
> Rendersystemdxempty
> Rendersystemvulkan
> Scenesystem
> Tier0
> Amd_fidelityfx_vk
> nvngx_dlss
> ```
> 
> ---------
> These two are responsible for allowing us to view Proj_projectile particles that citadel uses but doesn't like playing nice with CS2 Vphysics2 for some reason.
> 
> ```
> AssetPreview
> MeshSystem
> ```

</details>

## Why not cross-platform?
As far as I can tell, workshop tools for Linux do not exist for any Valve title made with Source 2, at least not Counter-Strike 2, which these tools are derived from. Besides, currently Deadlock doesn't even have a native Linux build. 


It is possible, however to successfully run this tool under Wine. Versions I've tested were: wine-staging 9.21 & 9.22, valve-wine 10.19 - resourcecompiler seemed to have no issues. Unfortunately the automatic installation is not possible unless the program is ran in the exact prefix Deadlock's bound to, so you'll have to install and enable the mod manually. Refer to this guide for more info on how to install Deadlock mods manually: [https://deadlockmodding.pages.dev/installing-mods](https://deadlockmodding.pages.dev/installing-mods)

## How to use?
- Download the [latest release](https://github.com/bouncytorch/deadlock_stats_editor/releases/latest).
- Run `randomizer_mod_generator.exe`.
- Once the generation is finished the program will automatically detect your Deadlock installation, if there is one.
  - If a Deadlock installation is detected, the program will offer to install and automatically enable the mod. After it's installed, it will show the exact file it generated.\nIf you do not know how to install Deadlock mods manually, check out this guide: [https://deadlockmodding.pages.dev/installing-mods](https://deadlockmodding.pages.dev/installing-mods)
  - If a Deadlock installation is not detected, the program will generate the .vpk in the `output` folder in the current working directory.
