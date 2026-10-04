export interface PackageRecord {
  name: string
  version: string
  repository: 'core' | 'extra'
  description: string
  dependencies: string[]
}

const names = [...new Set(`
acl archlinux-keyring attr autoconf automake bash bash-completion binutils bison btrfs-progs coreutils cracklib cryptsetup curl device-mapper dhcpcd diffutils e2fsprogs expat file filesystem findutils flex gawk gcc gcc-libs gettext glib2 glibc gmp gnupg gnutls grep gzip iproute2 iputils jfsutils less libarchive libcap libelf libffi libgcrypt libgpg-error libidn2 libksba libmnl libnftnl libnghttp2 libnghttp3 libngtcp2 libnl libpcap libpsl libssh2 libtirpc libunistring licenses linux linux-api-headers linux-firmware linux-lts logrotate lvm2 lz4 m4 make man-db man-pages mdadm nano ncurses netctl nftables openssh pacman pacman-mirrorlist pambase patch pciutils perl pinentry pkgconf procps-ng psmisc reiserfsprogs sed shadow sudo systemd systemd-libs systemd-sysvcompat tar texinfo thin-provisioning-tools tzdata util-linux vi which xfsprogs xz zlib zstd
acpi alacritty alsa-firmware alsa-lib alsa-utils android-tools ansible apache audacity awesome avahi blender bluez bluez-utils chromium clang cmake code composer-plugin cups dconf discord docker docker-compose dolphin dosfstools drawio electron emacs enchant evince exfatprogs exo ffmpeg firefox flameshot flatpak foot freerdp fzf galculator gimp git gnome-calculator gnome-disk-utility gnome-keyring gnome-shell gnome-terminal go google-chrome grub gtk3 gtk4 htop hunspell hunspell-en_us i3-wm imagemagick inkscape intel-media-driver intel-ucode iwd jq keepassxc kitty krita lazygit libinput libnotify libreoffice-fresh lightdm linux-headers lm_sensors lsof ltrace lutris lynx macchanger mesa micro mlocate mpv mumble neovim network-manager-applet networkmanager noto-fonts noto-fonts-emoji obs-studio openbox p7zip pavucontrol pipewire pipewire-alsa pipewire-pulse playerctl plasma-desktop plasma-wayland-session podman polkit pulseaudio python python-pip qemu-full ranger remmina ripgrep rofi rsync rustup signal-desktop slack smartmontools steam sxiv syncthing telegram-desktop terminus-font thunderbird tmux transmission-gtk tree ufw unrar unzip vlc waybar wezterm wine wireshark-qt wl-clipboard wofi xclip xdg-desktop-portal xdg-utils xf86-input-libinput xfce4 xfce4-terminal xorg-server xorg-xinit xorg-xwayland youtube-dl zathura zathura-pdf-mupdf
base-devel ccache ctags cppcheck cscope debuginfod delve doxygen eslint fd fop gcc-fortran gdb gh github-cli git-lfs go-tools gradle hadolint jdk-openjdk jdk17-openjdk jre-openjdk julia just kotlin-language-server lua lua-language-server luarocks maven meson nasm nodejs nodejs-lts-iron npm pandoc php php-fpm php-gd php-intl php-sqlite php-xdebug pnpm poetry protobuf pyright python-black python-build python-debugpy python-flake8 python-isort python-mypy python-numpy python-pandas python-pipx python-pytest python-requests python-scipy python-setuptools python-virtualenv python-wheel r ruby rubygems shellcheck shfmt sqlfluff stylua terraform texlive-basic typescript uv vagrant valgrind yarn zig
arc-gtk-theme awesome-terminal-fonts bibata-cursor-theme breeze breeze-gtk breeze-icons capitaine-cursors catppuccin-gtk-theme materia-gtk-theme papirus-icon-theme adwaita-cursors adwaita-icon-theme cantarell-fonts dejavu-fonts fcitx5 fcitx5-configtool fcitx5-gtk fcitx5-qt fontconfig foomatic-db foomatic-db-engine foomatic-db-nonfree foomatic-db-ppds foomatic-db-gutenprint-ppds freetype2 ghostscript gnu-free-fonts graphviz grub-btrfs gtk-engine-murrine gtkmm3 hicolor-icon-theme imagemagick lib32-glibc lib32-mesa lib32-nvidia-utils lib32-pipewire lib32-vulkan-icd-loader lib32-vulkan-radeon lib32-vulkan-intel libappindicator-gtk3 libcanberra libdecor libdrm libepoxy libglvnd libjpeg-turbo libpng libpulse libsecret libsndfile libtiff libva libvdpau libx11 libxkbcommon libxrandr libxrender libxslt llvm llvm-libs mesa-utils mtdev nvidia nvidia-dkms nvidia-utils opencv opencl-icd-loader opencl-mesa opencl-nvidia opengl-man-pages openmp patchelf pcre2 pixman qt5-base qt5-wayland qt6-base qt6-wayland sdl2 shared-mime-info shaderc vulkan-headers vulkan-icd-loader vulkan-intel vulkan-radeon vulkan-tools wayland xcb-proto xcb-util xcb-util-cursor xcb-util-image xcb-util-keysyms xcb-util-renderutil xcb-util-wm xkeyboard-config xorg-xauth xorg-xinput xorg-xrandr xorg-xrdb xorg-xsetroot
python-attrs python-babel python-certifi python-chardet python-colorama python-dateutil python-docutils python-filelock python-idna python-jinja python-markupsafe python-packaging python-platformdirs python-pygments python-pyparsing python-six python-tomli python-tqdm python-urllib3 python-yaml python-zipp python-aiohttp python-anyio python-argon2 python-asyncpg python-beautifulsoup4 python-click python-cryptography python-fastapi python-flask python-httpx python-ipython python-lxml python-matplotlib python-notebook python-openssl python-pillow python-psutil python-pydantic python-pygame python-pynacl python-rich python-sqlalchemy python-starlette python-tornado python-typer python-uvicorn python-watchdog python-websockets python-yapf python-zstandard
alsa-plugins at-spi2-core atk cairo enchant fribidi gdk-pixbuf2 gobject-introspection gsettings-desktop-schemas harfbuzz libayatana-appindicator libbsd libcloudproviders libdbusmenu-glib libdbusmenu-gtk3 libnotify libogg libsm libusb libvorbis libxcomposite libxcursor libxdamage libxfixes libxi libxinerama libxkbfile libxmu libxpm libxshmfence libxt libxtst libxxf86vm llvm17 llvm18 openal opus pango phonon-qt5 qt5-svg qt5-tools qt5-webengine qt5-x11extras qt6-svg qt6-tools rtkit sound-theme-freedesktop ttf-dejavu ttf-fira-code ttf-font-awesome ttf-inconsolata ttf-liberation ttf-roboto ttf-ubuntu-font-family xcb-util-xrm xorg-fonts-encodings xorg-fonts-misc xorgproto
`.trim().split(/\s+/))]

const knownDescriptions: Record<string, string> = {
  bash: 'The GNU Bourne Again SHell',
  base: 'Minimal package set defining a basic Arch Linux installation',
  'base-devel': 'Basic tools to build Arch Linux packages',
  curl: 'Command line tool and library for transferring data with URLs',
  firefox: 'Fast, private and safe web browser',
  git: 'The fast distributed version control system',
  htop: 'Interactive process viewer',
  linux: 'The Linux kernel and modules',
  neovim: 'Fork of Vim aiming to improve extensibility and usability',
  pacman: 'A library-based package manager with dependency support',
  python: 'The Python programming language',
  ripgrep: 'A line-oriented search tool that recursively searches directories',
  systemd: 'System and service manager for Linux',
  vim: 'Vi Improved, a highly configurable text editor'
}

export const packageCatalog: PackageRecord[] = names.map((name, index) => ({
  name,
  version: `${(index % 7) + 1}.${(index % 13) + 1}.${(index % 5) + 1}-1`,
  repository: index < 118 ? 'core' : 'extra',
  description: knownDescriptions[name] ?? `${name} package for the Arch Linux distribution`,
  dependencies: name === 'htop' || name === 'vim' ? ['glibc', 'ncurses'] : ['glibc']
}))