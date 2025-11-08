import { KeyValues3, KeyValues } from 'easy-keyvalues';
import fs from 'fs';
import WinReg from 'winreg';
import { Vpk } from 'node-vvpk';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import { spawnSync } from 'child_process';
import { app, dialog, shell } from 'electron';

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection', err)
    dialog.showErrorBox('Unhandled Rejection', String(err));
    app.exit(1);
})

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception', err)
    dialog.showErrorBox('Uncaught Exception', String(err?.stack || err.message || err));
    app.exit(1);
})

const CSDK_PATH = process.env.CSDK_PATH || path.join(app.isPackaged ? process.resourcesPath : process.cwd(), 'Reduced_CSDK_12');
const ADDON_NAME = process.env.ADDON_NAME || 'randomizer_mod';

const OUT_PATH = process.env.OUT_PATH || path.join(process.cwd(), 'output');
const RES_PATH = process.env.RES_PATH || path.join(process.cwd(), 'output/cache');

const VDATA_ABILITIES_URL = process.env.VDATA_ABILITIES_URL
    || 'https://raw.githubusercontent.com/SteamDatabase/GameTracking-Deadlock/refs/heads/master/game/citadel/pak01_dir/scripts/abilities.vdata';
const VDATA_HEROES_URL = process.env.VDATA_HEROES_URL
    || 'https://raw.githubusercontent.com/SteamDatabase/GameTracking-Deadlock/refs/heads/master/game/citadel/pak01_dir/scripts/heroes.vdata';

const RESOURCECOMPILER_PATH = path.join(CSDK_PATH, 'game/bin_tools/win64/resourcecompiler.exe');
const CONTENT_PATH = path.join(CSDK_PATH, 'content/citadel_addons', ADDON_NAME);
const GAME_PATH = path.join(CSDK_PATH, 'game/citadel_addons', ADDON_NAME);

const VDATA_ABILITIES_CACHE_PATH = path.join(RES_PATH, 'abilities.vdata');
const VDATA_HEROES_CACHE_PATH = path.join(RES_PATH, 'heroes.vdata');
const JSON_ABILITIES_PATH = path.join(RES_PATH, 'json/abilities');
const JSON_HEROES_PATH = path.join(RES_PATH, 'json/heroes');

// Verify CSDK paths.
[CSDK_PATH, RESOURCECOMPILER_PATH]
    .forEach((path) => {
        if (!fs.existsSync(path)) throw new Error(`CSDK 12 is invalid/missing. Path "${path}" does not exist. Verify your CSDK 12 installation.`);
    });

// Make necessary generated paths.
[OUT_PATH, RES_PATH, CONTENT_PATH, GAME_PATH, JSON_HEROES_PATH, JSON_ABILITIES_PATH]
    .forEach((path) => fs.mkdirSync(path, { recursive: true }));

async function getVdata(url: string, path: string): Promise<Buffer> {
    let vdataBuffer: Buffer;
    try {
        vdataBuffer = await new Promise((resolve, reject) => https.get(
            url,
            (response) => {
                if (response.statusCode && response.statusCode >= 400)
                    return reject(new Error(`HTTP ${response.statusCode} while downloading file.`));

                const chunks: Buffer[] = [];
                response.on('data', chunk => chunks.push(chunk))
                    .on('end', () => resolve(Buffer.concat(chunks)));
            }
        ));

        const digestSHA256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
        if (
            !fs.existsSync(path)
            || digestSHA256(vdataBuffer) !== digestSHA256(fs.readFileSync(path))
        )
            fs.writeFileSync(path, vdataBuffer);
    }
    catch (err) {
        console.error(err);
        if (!fs.existsSync(path))
            throw new Error("Vdata could not be downloaded and no local copy exists. Check your internet connection or change the URL to abilities.vdata.")
        vdataBuffer = fs.readFileSync(path);
    }

    return vdataBuffer;
}

(async () => {
    await app.whenReady();

    const vdataAbilitiesBuffer = await getVdata(VDATA_ABILITIES_URL, VDATA_ABILITIES_CACHE_PATH);
    const vdataAbilities = KeyValues3.Parse(vdataAbilitiesBuffer.toString());
    vdataAbilities.FindKey('_include')?.SetValue(KeyValues3.Array([])); // the includes in `abilities.vdata` break down compilation because the included files are not in the pak
    const vdataAbilitiesObject: { [key: string]: any } = vdataAbilities.toObject()
    const vdataAbilitiesEntries = Object.entries(vdataAbilitiesObject).sort()

    // the blocks below split the file into multiple categories
    const abilitiesWeapons = vdataAbilitiesEntries
        .filter(([_, value]) => value.m_eAbilityType == 'EAbilityType_Weapon')
    const abilitiesSignature = vdataAbilitiesEntries
        .filter(([_, value]) => value.m_eAbilityType == 'EAbilityType_Signature')
    const abilitiesItems = vdataAbilitiesEntries
        .filter(([_, value]) => value.m_eAbilityType == 'EAbilityType_Item')

    const vdataHeroesBuffer = await getVdata(VDATA_HEROES_URL, VDATA_HEROES_CACHE_PATH);
    const vdataHeroes = KeyValues3.Parse(vdataHeroesBuffer.toString());
    const vdataHeroesObject: { [key: string]: any } = vdataHeroes.toObject()
    const vdataHeroesEntries = Object.entries(vdataHeroesObject).sort()

    const heroesReleased = vdataHeroesEntries
        .filter(([_, value]) =>
            typeof value == 'object'
            && !value.m_bDisabled
            && !value.m_bNeedsTesting
            && value._base == 'hero_base'
        ).sort()

    fs.writeFileSync(path.join(JSON_ABILITIES_PATH, 'all.json'), JSON.stringify(vdataAbilitiesObject, null, 2))
    fs.writeFileSync(path.join(JSON_ABILITIES_PATH, 'weapons.json'), JSON.stringify(Object.fromEntries(abilitiesWeapons), null, 2));
    fs.writeFileSync(path.join(JSON_ABILITIES_PATH, 'abilities.json'), JSON.stringify(Object.fromEntries(abilitiesSignature), null, 2));
    fs.writeFileSync(path.join(JSON_ABILITIES_PATH, 'items.json'), JSON.stringify(Object.fromEntries(abilitiesItems), null, 2));

    fs.writeFileSync(path.join(JSON_HEROES_PATH, 'all.json'), JSON.stringify(vdataHeroesObject, null, 2));
    fs.writeFileSync(path.join(JSON_HEROES_PATH, 'released.json'), JSON.stringify(Object.fromEntries(heroesReleased), null, 2));

    // Here we categorize weapons
    const weaponsCategorized = {
        burst: abilitiesWeapons
            .filter((v) => v[1].m_WeaponInfo.m_iBullets == 1 && v[1].m_WeaponInfo.m_iBurstShotCount > 1)
            .map(([v]) => v)

    };

    fs.writeFileSync(path.join(JSON_ABILITIES_PATH, 'weaponsCategorized.json'), JSON.stringify(weaponsCategorized, null, 2));

    // Here we shuffle abilities of released heroes.
    const abilitySlots = 4;
    let abilityOrder: string[][] = Array.from({ length: abilitySlots }, () => []);
    const heroesNames = heroesReleased.map(([key]) => key);
    heroesReleased.forEach(([_, value]) =>
        abilityOrder.forEach((array, index) =>
            array.push(value.m_mapBoundAbilities[`ESlot_Signature_${index + 1}`])))

    const shuffleArray = (array: string[]) => {
        const n = array.length;
        const result = array.slice();
        const indices = [...Array(n).keys()];

        for (let i = 0; i < n; i++) {
            let choices = indices.filter(j => j !== i);
            let j = choices[Math.floor(Math.random() * choices.length)];
            result[i] = array[j];
            indices.splice(indices.indexOf(j), 1);
        }

        return result;
    }

    let abilityOrderShuffled: string[][] = abilityOrder.map(array => shuffleArray(array));

    // This changes the vdata
    heroesNames.forEach((key, index) =>
        abilityOrderShuffled.forEach((array, i) =>
            vdataHeroes
                .FindKey(key)
                ?.FindKey('m_mapBoundAbilities')
                ?.FindKey(`ESlot_Signature_${i + 1}`)
                ?.SetValue(KeyValues3.String(array[index]))));

    if (fs.existsSync(CONTENT_PATH)) fs.rmSync(CONTENT_PATH, { recursive: true })
    if (fs.existsSync(GAME_PATH)) fs.rmSync(GAME_PATH, { recursive: true })
    fs.mkdirSync(path.join(CONTENT_PATH, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(CONTENT_PATH, 'scripts/abilities.vdata'), vdataAbilities.toString());
    fs.writeFileSync(path.join(CONTENT_PATH, 'scripts/heroes.vdata'), vdataHeroes.toString());

    const resourceCompiler = spawnSync(
        path.join(RESOURCECOMPILER_PATH),
        [
            path.join(CONTENT_PATH, 'scripts/abilities.vdata'),
            path.join(CONTENT_PATH, 'scripts/heroes.vdata')
        ]
    )

    process.stdout.write(resourceCompiler.stdout);

    if (resourceCompiler.status)
        throw new Error(`resourcecompiler error. \n\nstdout: ${resourceCompiler.stdout}`);

    Vpk
        .fromDirectory(GAME_PATH)
        .saveToFile(path.join(OUT_PATH, `${ADDON_NAME}.vpk`));

    fs.rmSync(CONTENT_PATH, { recursive: true });
    fs.rmSync(GAME_PATH, { recursive: true });

    const steamPath = await new Promise<string | null>((resolve) => {
        const regKey = new WinReg({
            hive: WinReg.HKCU, // HKEY_CURRENT_USER
            key: '\\Software\\Valve\\Steam',
        });

        regKey.get('SteamPath', (err, item) => {
            if (err || !item?.value) resolve(null);
            else resolve(item.value);
        });
    });

    const gameDetectionFail = () => {
        if (
            !dialog.showMessageBoxSync({
                type: 'error',
                buttons: ['Open folder', 'Exit'],
                message: 'A .vpk archive has been generated for the randomizer mod, however automatic install isn\'t possible due to a missing or corrupt Steam/Deadlock install. Do you want to open the containing folder of the generated mod?'
            })
        ) shell.showItemInFolder(path.join(OUT_PATH, `${ADDON_NAME}.vpk`));
        dialog.showMessageBoxSync({
            type: 'info',
            message: 'To install manually, move the file into the game/citadel/addons folder of your game and rename to pak##_dir.vpk to enable (## is a number from 01 to 99)'
        })

        return app.exit();
    }

    if (!steamPath || !fs.existsSync(path.join(steamPath, 'config/libraryfolders.vdf')))
        return gameDetectionFail();

    const libraryFolders = await KeyValues.Load(path.join(steamPath, 'config/libraryfolders.vdf'))
    const libraryLocation = libraryFolders
        .FindKey('libraryfolders')
        ?.Find((kv) =>
            !!(kv.FindKey('apps')
                ?.FindKey('1422450'))
        )
        ?.FindKey('path')
        ?.GetValue()

    if (!libraryLocation || !fs.existsSync(path.join(libraryLocation, 'steamapps/common/Deadlock')))
        return gameDetectionFail();

    const gameinfoPath = path.join(libraryLocation, 'steamapps/common/Deadlock/game/citadel/gameinfo.gi')
    const addonsPath = path.join(libraryLocation, 'steamapps/common/Deadlock/game/citadel/addons');
    switch (
    dialog.showMessageBoxSync({
        type: 'question',
        buttons: ['Install and enable', 'Install', 'Open output folder', 'Exit'],
        message: 'A .vpk archive has been generated for the randomizer mod. The generator has detected a Deadlock installation. Do you want to install it or open the folder with the generated .vpk?'
    })
    ) {
        case 0: {
            if (!fs.existsSync(gameinfoPath)) return gameDetectionFail();
            
            let pakNum = 1;
            if (!fs.existsSync(addonsPath)) fs.mkdirSync(addonsPath, { recursive: true });
            else {
                const files = fs.readdirSync(addonsPath).filter(v => v.startsWith('pak') && v.endsWith('_dir.vpk'));
                const numbers = files.map(v => {
                    const match = v.match(/^pak(\d+)_dir\.vpk$/);
                    return match ? parseInt(match[1], 10) : null;
                })
                .filter((n): n is number => n !== null)
                .sort((a, b) => a - b);

                
                for (const num of numbers) {
                    if (num !== pakNum || pakNum == 100) break;
                    pakNum++;
                }

                if (pakNum == 100) {
                    dialog.showMessageBoxSync({
                        type: 'error',
                        message: 'You don\'t have space for any additional mods. Remove some mod to enable the randomizer.'
                    });
                    break;
                }
            }
            fs.copyFileSync(path.join(OUT_PATH, `${ADDON_NAME}.vpk`), path.join(addonsPath, `pak${pakNum.toString().padStart(2, "0")}_dir.vpk`));

            const gameinfo = await KeyValues.Load(gameinfoPath);
            const searchPaths = gameinfo
                .FindKey('GameInfo')
                ?.FindKey('FileSystem')
                ?.FindKey('SearchPaths');
            if (
                (!searchPaths?.FindAllKeys('Game')?.map(v => v.GetValue()).includes('citadel/addons')
                    || !searchPaths?.FindAllKeys('Mod')?.map(v => v.GetValue()).find(v => v == 'core' || v == 'citadel')
                    || !searchPaths?.FindAllKeys('Write')?.map(v => v.GetValue()).find(v => v == 'core' || v == 'citadel'))
                && !dialog.showMessageBoxSync({
                    type: 'warning',
                    message: 'You don\'t appear to have mods enabled. Would you like to enable them?',
                    buttons: ['Enable mods', 'No thanks'],
                })
            ) {
                searchPaths?.Free();
                gameinfo
                    .FindKey('GameInfo')
                    ?.FindKey('FileSystem')
                    ?.Append(new KeyValues('SearchPaths', [
                        new KeyValues('Game', 'citadel/addons'),
                        new KeyValues('Mod', 'citadel'),
                        new KeyValues('Write', 'citadel'),
                        new KeyValues('Game', 'citadel'),
                        new KeyValues('Mod', 'core'),
                        new KeyValues('Write', 'core'),
                        new KeyValues('Game', 'core'),
                    ]))

                await gameinfo.Save(gameinfoPath);
            }

            shell.showItemInFolder(path.join(addonsPath, `pak${pakNum.toString().padStart(2, "0")}_dir.vpk`));
            dialog.showMessageBoxSync({
                type: 'info',
                message: 'After exploitation, you can rename the file to anything you want to disable it'
            })

            break;
        }
            
        case 1: {
            if (!fs.existsSync(addonsPath)) fs.mkdirSync(addonsPath, { recursive: true });
            fs.copyFileSync(path.join(OUT_PATH, `${ADDON_NAME}.vpk`), path.join(addonsPath, `${ADDON_NAME}.vpk`));
            shell.showItemInFolder(path.join(addonsPath, `${ADDON_NAME}.vpk`));
            dialog.showMessageBoxSync({
                type: 'info',
                message: 'To enable, rename the file to pak##_dir.vpk to enable (## is a number from 01 to 99)'
            })
            break;
        }
        case 2: 
            shell.showItemInFolder(path.join(OUT_PATH, `${ADDON_NAME}.vpk`));
            dialog.showMessageBoxSync({
                type: 'info',
                message: 'To install manually, move the file into the game/citadel/addons folder of your game and rename to pak##_dir.vpk to enable (## is a number from 01 to 99)'
            });
            break;
    }

    return app.exit();
})()