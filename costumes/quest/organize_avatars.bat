@echo off
setlocal enabledelayedexpansion

:: organize_avatars.bat
::
:: Organizes files named like:
::   assistant-<name>.png
::   avatar-<name>.png
::
:: into per-character folders:
::   <name>\
::       assistant-<name>.png
::       avatar.png      <-- renamed from avatar-<name>.png
::
:: Usage:
::   1. Put this .bat file in the SAME folder as the png files.
::   2. Double-click it, or run it from cmd: organize_avatars.bat
::
:: By default it does a DRY RUN (just prints what it would do).
:: To actually move/rename files, run with /apply:
::   organize_avatars.bat /apply

set APPLY=0
if /I "%~1"=="/apply" set APPLY=1

set count=0

for %%F in (avatar-*.png) do (
    set "avatarfile=%%F"
    set "basename=%%~nF"
    set "name=!basename:~7!"
    set "assistantfile=assistant-!name!.png"

    if exist "!assistantfile!" (
        echo Folder: !name!
        echo   !assistantfile!  -^> !name!\!assistantfile!
        echo   !avatarfile!      -^> !name!\avatar.png

        if !APPLY! == 1 (
            if not exist "!name!" mkdir "!name!"
            move /Y "!assistantfile!" "!name!\!assistantfile!" >nul
            move /Y "!avatarfile!" "!name!\avatar.png" >nul
        )

        set /a count+=1
    ) else (
        echo WARNING: no matching "!assistantfile!" found for "!avatarfile!" - skipping
    )
)

echo.
if !APPLY! == 1 (
    echo Done. Organized !count! characters.
) else (
    echo Dry run complete. !count! characters would be organized.
    echo Run again with /apply to actually move the files:
    echo     organize_avatars.bat /apply
)

pause
