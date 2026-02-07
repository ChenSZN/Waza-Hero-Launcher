from PyQt6.QtGui import QFont, QColor, QPalette, QBrush, QImage, QPixmap, QIcon, QRegion, QPainterPath
from PyQt6.QtCore import Qt, pyqtSignal, QSize, QTimer, QPropertyAnimation, QEasingCurve
from PyQt6.QtWidgets import (QMainWindow, QWidget, QLabel, QPushButton, 
                              QTextEdit, QProgressBar, QFrame, QApplication,
                              QStackedWidget, QTableWidget, QTableWidgetItem, 
                              QHeaderView, QAbstractItemView, QCheckBox, QLineEdit,
                              QVBoxLayout, QHBoxLayout, QSpacerItem, QSizePolicy,
                              QGraphicsOpacityEffect)
import os
import webbrowser
from src.utils.resource_utils import resource_path

# --- GLOBAL VERSION ---
VERSION = "1.1.0"

# --- ESTILOS QSS (CSS para escritorio) ---
STYLESHEET = """
QMainWindow {
    background: transparent;
}

QWidget#MainContainer {
    background-color: #010A13;
    border-radius: 20px;
    border: 1px solid #2A2E33;
}

QLabel#MainBg {
    border-radius: 20px;
}

/* Redesigned Glass Cards */
QPushButton#GlassCard {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
}

QPushButton#GlassCard:hover {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(10, 200, 185, 0.4);
}

QLabel#CardTitle {
    color: #F0E6D2;
    font-weight: bold;
    font-size: 13px;
    letter-spacing: 1px;
}

QLabel#CardDesc {
    color: #999;
    font-size: 10px;
}

QLabel#CardIcon {
    font-size: 32px;
}

/* Alert Notification Detail */
QWidget#AlertFrame {
    background: rgba(255, 204, 0, 0.05);
    border: 1px solid rgba(255, 204, 0, 0.2);
    border-radius: 10px;
}

QLabel#AlertMsg {
    color: #FFCC00;
    font-family: 'Segoe UI';
    font-size: 11px;
    font-weight: bold;
}

/* Glass Panels */
QFrame#GlassPanel {
    background-color: rgba(10, 15, 25, 210); /* Fondo semitransparente real */
    border: 1px solid #3C3C41;
    border-radius: 12px;
}

/* Top Nav Labels */
QLabel#NavText {
    color: #939393;
    font-weight: bold;
    font-family: "Segoe UI";
    font-size: 11px;
}
QLabel#NavText:hover {
    color: #F0E6D2;
}

/* Sidebar Icons */
QPushButton#SideBtn {
    background-color: transparent;
    border: none;
    color: #666;
    font-size: 18px;
    border-left: 3px solid transparent;
}
QPushButton#SideBtn:hover {
    color: #0AC8B9;
    background-color: rgba(255, 255, 255, 10);
    border-left: 3px solid #0AC8B9;
}

/* Hero Title */
QLabel#HeroTitle {
    color: #FFFFFF;
    font-family: "Impact";
    font-size: 72px;
    line-height: 0.8;
}

QLabel#HeroSub {
    color: #C9C9C9;
    font-family: "Segoe UI";
    font-size: 14px;
}

/* Play Button (The Star) */
QPushButton#PlayBtn {
    background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #00dcd7, stop:1 #00b4b0);
    color: #010A13;
    font-family: "Segoe UI";
    font-size: 16px;
    font-weight: bold;
    border-radius: 27px; /* Pill shape */
    border: 2px solid #C8AA6E;
}
QPushButton#PlayBtn:hover {
    background-color: #aafffe;
    border-color: #fff;
}
QPushButton#PlayBtn:pressed {
    background-color: #008885;
}

/* Glass Cards (Bottom Right) */
QPushButton#GlassCard {
    background-color: rgba(10, 10, 12, 180);
    border: 1px solid #333;
    border-radius: 12px;
    text-align: left;
    color: #eee;
}
QPushButton#GlassCard:hover {
    background-color: rgba(20, 20, 30, 220);
    border-color: #C8AA6E;
}

/* Status Bar */
QProgressBar {
    background-color: #111;
    border-radius: 2px;
    text-align: center;
}
QProgressBar::chunk {
    background-color: #0AC8B9;
    border-radius: 2px;
}

QTextEdit {
    background-color: rgba(0, 0, 0, 100);
    color: #8899A6;
    border: none;
    font-family: "Consolas";
    font-size: 10px;
}
"""

class LauncherWindow(QMainWindow):
    # Signals
    sig_sync = pyqtSignal()
    sig_play = pyqtSignal()
    sig_config = pyqtSignal()
    
    # New Signals for Selection
    sig_confirm_download = pyqtSignal(list) # List of dicts/paths
    sig_cancel_selection = pyqtSignal()
    sig_cancel_selection = pyqtSignal()
    sig_open_library = pyqtSignal() # Request to open library
    sig_go_home = pyqtSignal() # Request to go home (cleanup)
    sig_update_available = pyqtSignal(str, str) # version, url

    # Thread-Safe Signals
    _sig_status = pyqtSignal(str, str, str)
    _sig_progress = pyqtSignal(float)
    _sig_log = pyqtSignal(str)
    _sig_enable_sync = pyqtSignal(bool)
    _sig_show_selection = pyqtSignal(list) # To trigger selection view
    _sig_show_home = pyqtSignal()

    def __init__(self):
        super().__init__()
        self.setWindowTitle("Waza Hero by ChenSZN")
        self.setFixedSize(1100, 650)
        
        # Connect Signals
        self._sig_status.connect(self._slot_status)
        self._sig_progress.connect(self._slot_progress)
        self._sig_log.connect(self._slot_log)
        self._sig_enable_sync.connect(self._slot_enable_sync)
        self._sig_show_selection.connect(self._slot_show_selection)
        self._sig_show_home.connect(self._slot_show_home)
        self.sig_update_available.connect(self.show_update_notification)
        
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        
        self.setStyleSheet(STYLESHEET)

        # Window Icon
        icon_path = resource_path("assets/WAZAHEROICON.ico")
        if not os.path.exists(icon_path):
            icon_path = resource_path("assets/icon.ico")
        if not os.path.exists(icon_path):
            icon_path = resource_path("assets/icon.png")
        
        if os.path.exists(icon_path):
            self.setWindowIcon(QIcon(icon_path))

        # 1. Wrapper Widget (Completely transparent)
        self.wrapper = QWidget()
        self.wrapper.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setCentralWidget(self.wrapper)
        
        # USE CUSTOM LAYOUT FOR WRAPPER TO AVOID QMAINWINDOW CONFLICT
        wrapper_layout = QVBoxLayout(self.wrapper)
        wrapper_layout.setContentsMargins(5, 5, 5, 5) 
        
        # 2. Main Styled Container 
        self.central_widget = QWidget() 
        self.central_widget.setObjectName("MainContainer")
        wrapper_layout.addWidget(self.central_widget)

        # Background Layer System (Carousel)
        self.bg_label_back = QLabel(self.central_widget)
        self.bg_label_back.setObjectName("MainBg")
        self.bg_label_back.setGeometry(0, 0, 1090, 640)

        self.bg_label_front = QLabel(self.central_widget)
        self.bg_label_front.setObjectName("MainBg")
        self.bg_label_front.setGeometry(0, 0, 1090, 640)

        # Ensure correct stacking: front above back, both at bottom
        self.bg_label_front.lower()
        self.bg_label_back.lower()

        # Opacity Effect for Front Label
        self.bg_opacity_effect = QGraphicsOpacityEffect(self.bg_label_front)
        self.bg_label_front.setGraphicsEffect(self.bg_opacity_effect)
        self.bg_opacity_effect.setOpacity(0.0) # Start transparent

        # Animation Settings
        self.bg_transition_anim = QPropertyAnimation(self.bg_opacity_effect, b"opacity")
        self.bg_transition_anim.setDuration(1500) # 1.5s fade
        self.bg_transition_anim.setEasingCurve(QEasingCurve.Type.InOutQuad)
        self.bg_transition_anim.finished.connect(self._on_bg_anim_finished)

        # Background Overlay (Gradient for readability)
        self.bg_overlay = QFrame(self.central_widget)
        self.bg_overlay.setObjectName("BgOverlay")
        self.bg_overlay.setGeometry(0, 0, 1090, 640)
        self.bg_overlay.setStyleSheet("""
            background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                                        stop:0 rgba(10, 15, 25, 230),
                                        stop:0.4 rgba(10, 15, 25, 150),
                                        stop:0.6 rgba(10, 15, 25, 0));
            border: none;
        """)
        self.bg_overlay.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)

        # Carousel State
        self.bg_paths = []
        self.bg_index = 0
        self.init_carousel()

        # Window Dragging State
        self._dragging = False
        self._drag_pos = None
        
        # Init Pages
        self.setup_ui()

    def init_carousel(self):
        # Scan assets for background files
        valid_ext = ('.jpg', '.jpeg', '.png', '.webp')
        assets_dir = resource_path("assets")
        if os.path.exists(assets_dir):
            # Include ALL images in assets/ for the carousel
            self.bg_paths = [os.path.join(assets_dir, f) for f in os.listdir(assets_dir) 
                             if f.lower().endswith(valid_ext)]
        
        # fallback if nothing found
        if not self.bg_paths:
            print("[WARN] No background assets found in assets/")
            return

        # Load first image
        pix = QPixmap(self.bg_paths[0])
        if not pix.isNull():
            scaled_pix = pix.scaled(
                1100, 650, 
                Qt.AspectRatioMode.KeepAspectRatioByExpanding, 
                Qt.TransformationMode.SmoothTransformation
            )
            self.bg_label_back.setPixmap(scaled_pix)
        else:
            print(f"[ERROR] Could not load background: {self.bg_paths[0]}")
        
        # Start Timer
        if len(self.bg_paths) > 1:
            self.carousel_timer = QTimer(self)
            self.carousel_timer.timeout.connect(self.next_background)
            self.carousel_timer.start(8000) # 8 seconds per image

    def next_background(self):
        if self.bg_transition_anim.state() == QPropertyAnimation.State.Running:
            return
            
        self.bg_index = (self.bg_index + 1) % len(self.bg_paths)
        pix = QPixmap(self.bg_paths[self.bg_index])
        
        if pix.isNull():
            # Skip this one if invalid
            QTimer.singleShot(100, self.next_background)
            return

        next_pix = pix.scaled(
            1100, 650, 
            Qt.AspectRatioMode.KeepAspectRatioByExpanding, 
            Qt.TransformationMode.SmoothTransformation
        )
        
        # Setup front label with next image and fade in
        self.bg_label_front.setPixmap(next_pix)
        self.bg_transition_anim.setStartValue(0.0)
        self.bg_transition_anim.setEndValue(1.0)
        self.bg_transition_anim.start()

    def _on_bg_anim_finished(self):
        # Once faded in, move the image to back label and reset front for next use
        if self.bg_opacity_effect.opacity() > 0.5:
            self.bg_label_back.setPixmap(self.bg_label_front.pixmap())
            self.bg_opacity_effect.setOpacity(0.0)
            self.bg_label_front.clear()

    def load_background(self):
        # Obsolote, handled by carousel now
        pass

    def setup_ui(self):
        # Create the Stack first
        self.stack = QStackedWidget(self.central_widget)

        # Main Layout for Styled Container
        self.main_layout = QVBoxLayout(self.central_widget)
        self.main_layout.setContentsMargins(0, 0, 0, 0)
        self.main_layout.setSpacing(0)

        # --- GLOBAL HEADER ---
        self.frm_header = QFrame()
        self.frm_header.setFixedHeight(80)
        self.frm_header.setStyleSheet("background: transparent; border: none;")
        
        # Header Layout (Buttons + Status)
        self.header_layout = QHBoxLayout(self.frm_header)
        self.header_layout.setContentsMargins(40, 10, 40, 10)
        self.header_layout.setSpacing(10)

        # Nav Buttons Container
        self.nav_container = QWidget()
        self.nav_layout = QHBoxLayout(self.nav_container)
        self.nav_layout.setContentsMargins(0, 0, 0, 0)
        self.nav_layout.setSpacing(10) # Minimal base spacing

        nav_data = [
            ("INICIO", self.sig_go_home.emit),
            ("CANCIONES", self.sig_open_library.emit),
            ("ACERCA DE", lambda: self.stack.setCurrentIndex(3)),
            ("WEB", lambda: self.open_url("https://clonehero.net")),
            ("DISCORD", lambda: self.open_url("https://discord.gg/clonehero")),
            ("SALIR", self.close)
        ]
        
        for text, callback in nav_data:
            btn = QPushButton(text)
            btn.setFixedHeight(40) # Keep height, but let width be dynamic
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            if text == "SALIR":
                btn.setStyleSheet("""
                    QPushButton {
                        color: #aa0000; font-weight: bold; font-family: 'Segoe UI'; font-size: 13px;
                        background: transparent; border: none; text-align: center;
                        padding: 0 15px; /* Use padding for uniform space between labels */
                    }
                    QPushButton:hover { color: #cc3333; background: transparent; }
                """)
            else:
                btn.setStyleSheet("""
                    QPushButton {
                        color: #939393; font-weight: bold; font-family: 'Segoe UI'; font-size: 13px;
                        background: transparent; border: none; text-align: center;
                        padding: 0 15px; /* Use padding for uniform space between labels */
                    }
                    QPushButton:hover { color: #ffffff; background: transparent; }
                """)
            btn.clicked.connect(callback)
            self.nav_layout.addWidget(btn)

        self.header_layout.addWidget(self.nav_container)
        
        # Spacer
        self.header_layout.addSpacerItem(QSpacerItem(40, 20, QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Minimum))

        # --- GLOBAL STATUS OVERLAY ---
        self.frm_status = QFrame()
        self.frm_status.setObjectName("GlassPanel")
        self.frm_status.setFixedSize(300, 80)

        self.lbl_status = QLabel("ONLINE", self.frm_status)
        self.lbl_status.setStyleSheet("color: #0AC8B9; font-weight: bold; font-family: 'Segoe UI';")
        self.lbl_status.setGeometry(20, 15, 260, 20)
        self.lbl_status.setAlignment(Qt.AlignmentFlag.AlignRight)

        self.lbl_substatus = QLabel("Esperando...", self.frm_status)
        self.lbl_substatus.setStyleSheet("color: #aaa; font-size: 11px;")
        self.lbl_substatus.setGeometry(20, 35, 260, 20)
        self.lbl_substatus.setAlignment(Qt.AlignmentFlag.AlignRight)

        self.pbar = QProgressBar(self.frm_status)
        self.pbar.setGeometry(20, 60, 260, 4)
        self.pbar.setTextVisible(False)
        self.pbar.setValue(0)
        
        self.header_layout.addWidget(self.frm_status)

        # Add Header to Main Layout
        self.main_layout.addWidget(self.frm_header)

        # --- CONTENT STACK ---
        self.stack.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self.main_layout.addWidget(self.stack)

        # Pages
        # Page 1: Home
        self.page_home = QWidget()
        self._setup_home_page(self.page_home)
        self.stack.addWidget(self.page_home)
        
        # Page 2: Selection
        self.page_selection = QWidget()
        self._setup_selection_page(self.page_selection)
        self.stack.addWidget(self.page_selection)
        
        # Page 3: Songs List
        self.page_songs = QWidget()
        self._setup_songs_page(self.page_songs)
        self.stack.addWidget(self.page_songs)

        # Page 4: About
        self.page_about = QWidget()
        self._setup_about_page(self.page_about)
        self.stack.addWidget(self.page_about)

        # --- Update Banner (At the end to be on top) ---
        self._setup_update_banner(self.central_widget)
        
        self.stack.setCurrentIndex(0)
        self.stack.currentChanged.connect(self.on_page_changed)

        # Ensure Background elements are at the absolute bottom
        # Order of lower() matters: overlay first, then front label, then back label
        # This stacks them: back (bottom) -> front (middle) -> overlay (top of backgrounds)
        self.bg_overlay.lower()
        self.bg_label_front.lower()
        self.bg_label_back.lower()

    def _setup_home_page(self, parent):
        # 1. Header moved to Global setup_ui
        pass
        
        # 3. Hero Section
        self.hero_frame = QWidget(parent)
        self.hero_frame.setGeometry(100, 40, 400, 400) # Moved UP (was 180)

        title = QLabel("WAZA\nHERO", self.hero_frame)
        title.setObjectName("HeroTitle")
        title.move(0, 0)
        title.resize(400, 160)

        sub = QLabel("Sincronizar tus canciones\nnunca fue tan fácil.", self.hero_frame)
        sub.setObjectName("HeroSub")
        sub.move(5, 170)
        sub.resize(400, 30) 
        sub.setWordWrap(True)

        self.btn_play = QPushButton("INICIAR CLONE HERO   ▶", self.hero_frame)
        self.btn_play.setObjectName("PlayBtn")
        self.btn_play.move(0, 240)
        self.btn_play.resize(220, 55)
        self.btn_play.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_play.clicked.connect(self.sig_play.emit)

        self.btn_sync, self.lbl_sync_icon = self.create_card(parent, 750, 320, "🔄", "SINCRONIZAR", "Buscar canciones en el servidor", self.sig_sync)
        self.btn_config, _ = self.create_card(parent, 920, 320, "⚙️", "CONFIG", "Rutas y Datos", self.sig_config)

        # 5. Alert Notification (❗ Symbol + Text)
        self.frm_alert = QWidget(parent)
        self.frm_alert.setObjectName("AlertFrame")
        self.frm_alert.setGeometry(100, 370, 220, 50) # Reduced width from 260 to 220
        alert_layout = QHBoxLayout(self.frm_alert)
        alert_layout.setContentsMargins(15, 0, 15, 0)
        alert_layout.setSpacing(6)

        self.lbl_alert_icon = QLabel("❗")
        self.lbl_alert_icon.setStyleSheet("font-size: 20px; color: #FFCC00; background: transparent;")
        
        self.lbl_alert_text = QLabel("SINCRONIZACIÓN PENDIENTE\nPulsa Sincronizar para ver.")
        self.lbl_alert_text.setObjectName("AlertMsg")
        self.lbl_alert_text.setStyleSheet("background: transparent;")
        
        alert_layout.addWidget(self.lbl_alert_icon)
        alert_layout.addWidget(self.lbl_alert_text)
        alert_layout.addStretch()
        
        self.frm_alert.setToolTip("Hay canciones que no has descargado en la lista de Resultados.")
        self.frm_alert.hide() 


    def create_card(self, parent, x, y, icon, title, desc, signal):
        # Premium Card Container
        btn = QPushButton(parent)
        btn.setObjectName("GlassCard")
        btn.setGeometry(x, y, 150, 200)
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        
        # Icon
        lbl_icon = QLabel(icon, parent)
        lbl_icon.setObjectName("CardIcon")
        lbl_icon.setGeometry(x, y + 30, 150, 50)
        lbl_icon.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lbl_icon.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        
        # Title
        lbl_title = QLabel(title, parent)
        lbl_title.setObjectName("CardTitle")
        lbl_title.setGeometry(x, y + 90, 150, 30)
        lbl_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lbl_title.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        
        # Description
        lbl_desc = QLabel(desc, parent)
        lbl_desc.setObjectName("CardDesc")
        lbl_desc.setGeometry(x + 10, y + 120, 130, 50)
        lbl_desc.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lbl_desc.setWordWrap(True)
        lbl_desc.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)

        # Store labels in button for easy access
        btn.icon_label = lbl_icon
        btn.title_label = lbl_title
        btn.desc_label = lbl_desc

        btn.clicked.connect(signal.emit)
        return btn, lbl_icon 


    def _setup_selection_page(self, parent):
        # We'll implement this in the next step
        pass

    def _setup_selection_page(self, parent):
        # --- Title ---
        lbl_title = QLabel("NUEVOS CHART DETECTADOS", parent)
        lbl_title.setStyleSheet("font-family: 'Impact'; font-size: 40px; color: #F0E6D2;")
        lbl_title.move(50, 20) # Moved up
        lbl_title.resize(800, 50)

        lbl_sub = QLabel("Selecciona las canciones que deseas descargar.", parent)
        lbl_sub.setStyleSheet("font-family: 'Segoe UI'; font-size: 14px; color: #aaa;")
        lbl_sub.move(55, 65) # Moved up

        # --- Search Bar ---
        self.txt_search =  QPushButton("🔍", parent) # Just icon
        self.txt_search.setStyleSheet("border: none; background: transparent; font-size: 16px;")
        self.txt_search.move(50, 95) # Moved up
        
        # Let's use QLineEdit properly
        # from PyQt6.QtWidgets import QLineEdit # Already imported globally
        self.inp_search = QLineEdit(parent)
        self.inp_search.setPlaceholderText("Buscar canción o artista...")
        self.inp_search.setGeometry(80, 95, 300, 30) # Moved up
        self.inp_search.setStyleSheet("""
            QLineEdit {
                background-color: rgba(0, 0, 0, 50);
                color: #ddd;
                border: 1px solid #444;
                border-radius: 15px;
                padding-left: 10px;
                font-family: 'Segoe UI';
            }
            QLineEdit:focus {
                border: 1px solid #0AC8B9;
            }
        """)
        self.inp_search.textChanged.connect(self.filter_table)

        # --- Select All Checkbox ---
        self.chk_select_all = QCheckBox("Seleccionar todo", parent)
        self.chk_select_all.move(400, 100) # Moved up
        self.chk_select_all.setChecked(True)
        self.chk_select_all.setStyleSheet("color: #aaa; font-family: 'Segoe UI';")
        self.chk_select_all.stateChanged.connect(self.toggle_all_selection)

        self.lbl_selection_summary = QLabel("0 seleccionadas de 0 disponibles", parent)
        self.lbl_selection_summary.setStyleSheet("color: #0AC8B9; font-family: 'Segoe UI'; font-weight: bold; font-size: 13px;")
        self.lbl_selection_summary.move(550, 100)
        self.lbl_selection_summary.resize(400, 20)

        # --- Table ---
        self.table_songs = QTableWidget(parent)
        self.table_songs.setGeometry(50, 140, 1000, 350) # Moved up, height reduced slightly
        self.table_songs.setColumnCount(3)
        self.table_songs.setHorizontalHeaderLabels(["", "Canción / Archivo", "Estado"])
        self.table_songs.verticalHeader().setVisible(False)
        self.table_songs.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table_songs.setAlternatingRowColors(True)
        
        # Table Style
        self.table_songs.setStyleSheet("""
            QTableWidget {
                background-color: rgba(10, 15, 25, 200);
                color: #ddd;
                font-family: 'Segoe UI';
                font-size: 13px;
                border: 1px solid #3C3C41;
                gridline-color: #222;
            }
            QHeaderView::section {
                background-color: #010A13;
                color: #C8AA6E;
                padding: 5px;
                border: 1px solid #333;
            }
            QTableWidget::item {
                padding: 5px;
            }
            QTableWidget::item:selected {
                background-color: rgba(10, 200, 185, 50);
            }
        """)
        
        # Col Widths
        header = self.table_songs.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.Fixed) # Checkbox
        self.table_songs.setColumnWidth(0, 50)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch) # Name
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed) # Size
        self.table_songs.setColumnWidth(2, 120)

        # --- Buttons ---
        self.btn_dl_selection = QPushButton("DESCARGAR SELECCIONADOS", parent)
        self.btn_dl_selection.setObjectName("PlayBtn") # Re-use Hero Button Style
        self.btn_dl_selection.setGeometry(800, 510, 250, 50) # Moved UP to 510
        self.btn_dl_selection.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_dl_selection.clicked.connect(self.emit_confirm_download)

        self.btn_cancel_selection = QPushButton("Cancelar", parent)
        self.btn_cancel_selection.setStyleSheet("""
            background-color: transparent;
            color: #aaa;
            font-weight: bold;
            font-size: 14px;
            border: 1px solid #555;
            border-radius: 5px;
        """)
        self.btn_cancel_selection.setGeometry(650, 510, 130, 50) # Moved UP to 510
        self.btn_cancel_selection.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_cancel_selection.clicked.connect(self.sig_cancel_selection.emit)
        self.btn_cancel_selection.clicked.connect(lambda: self.set_sync_card_mode("SYNC"))

        # --- Progress Bar Container (Initially Hidden) ---
        self.frm_selection_progress = QFrame(parent)
        self.frm_selection_progress.setObjectName("GlassPanel")
        self.frm_selection_progress.setGeometry(50, 500, 580, 70)
        self.frm_selection_progress.hide()

        self.lbl_selection_status = QLabel("PREPARANDO DESCARGA...", self.frm_selection_progress)
        self.lbl_selection_status.setStyleSheet("color: #0AC8B9; font-weight: bold; font-family: 'Segoe UI'; font-size: 11px;")
        self.lbl_selection_status.setGeometry(15, 12, 400, 20)

        self.lbl_selection_substatus = QLabel("Iniciando conexión con el servidor...", self.frm_selection_progress)
        self.lbl_selection_substatus.setStyleSheet("color: #aaa; font-size: 11px;")
        self.lbl_selection_substatus.setGeometry(15, 30, 550, 20)

        self.pbar_selection = QProgressBar(self.frm_selection_progress)
        self.pbar_selection.setGeometry(15, 52, 550, 6)
        self.pbar_selection.setTextVisible(False)
        self.pbar_selection.setValue(0)
        self.pbar_selection.setStyleSheet("""
            QProgressBar { background: #111; border-radius: 3px; border: none; }
            QProgressBar::chunk { background: #0AC8B9; border-radius: 3px; }
        """)

    def set_selection_downloading_state(self, is_downloading):
        if is_downloading:
            self.btn_dl_selection.setText("DESCARGANDO...")
            self.btn_dl_selection.setEnabled(False)
            self.btn_cancel_selection.setEnabled(False)
            # Visual feedback on disabled state
            self.btn_dl_selection.setStyleSheet("background-color: #333; color: #888; border: 1px solid #555;")
            self.frm_selection_progress.show() # SHOW Progress
        else:
            self.btn_dl_selection.setText("DESCARGAR SELECCIONADOS")
            self.btn_dl_selection.setEnabled(True)
            self.btn_cancel_selection.setEnabled(True)
            # Restore PlayBtn style
            self.btn_dl_selection.setStyleSheet("") 
            self.frm_selection_progress.hide() # HIDE Progress

    def populate_table(self, songs_list):
        # Disconnect to avoid redundant connections or recursion
        try:
            self.table_songs.itemChanged.disconnect(self.update_selection_counter)
        except: pass

        self.table_songs.setRowCount(0)
        self.current_songs_data = songs_list # list of dicts: {name, files, status}
        
        # Optimization: block signals during bulk update
        self.table_songs.blockSignals(True)
        self.table_songs.setRowCount(len(songs_list))
        
        for i, song in enumerate(songs_list):
            # Checkbox cell
            item_check = QTableWidgetItem()
            item_check.setFlags(Qt.ItemFlag.ItemIsUserCheckable | Qt.ItemFlag.ItemIsEnabled)
            item_check.setCheckState(Qt.CheckState.Checked)
            self.table_songs.setItem(i, 0, item_check)
            
            # Name + File Count
            name_display = f"{song['name']} ({len(song['files'])} archivos)"
            self.table_songs.setItem(i, 1, QTableWidgetItem(name_display))
            
            # State
            item_status = QTableWidgetItem(song['status'])
            item_status.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table_songs.setItem(i, 2, item_status)

        self.table_songs.blockSignals(False)
        self.update_selection_counter()
        
        # Connect signal for dynamic updates
        self.table_songs.itemChanged.connect(self.update_selection_counter)

    def update_selection_counter(self, item=None):
        count = 0
        total = self.table_songs.rowCount()
        for i in range(total):
            state = self.table_songs.item(i, 0).checkState()
            if state == Qt.CheckState.Checked:
                count += 1
        
        self.lbl_selection_summary.setText(f"{count} seleccionadas de {total} disponibles")

    def toggle_all_selection(self, state):
        # Prevent recursive signals
        self.table_songs.itemChanged.disconnect(self.update_selection_counter)
        
        check_state = Qt.CheckState.Checked if state == 2 else Qt.CheckState.Unchecked
        for i in range(self.table_songs.rowCount()):
            self.table_songs.item(i, 0).setCheckState(check_state)
            
        self.update_selection_counter()
        self.table_songs.itemChanged.connect(self.update_selection_counter)

    def emit_confirm_download(self):
        selected_files = []
        for i in range(self.table_songs.rowCount()):
            if self.table_songs.item(i, 0).checkState() == Qt.CheckState.Checked:
                # Add all files from this song group
                group = self.current_songs_data[i]
                selected_files.extend(group['files'])
        
        self.sig_confirm_download.emit(selected_files)
        self.set_sync_card_mode("SYNC") # Reset card logic on confirm

    # --- Public Methods Thread-Safe ---
    def show_selection(self, songs):
        self._sig_show_selection.emit(songs)
    
    def show_home(self):
        self._sig_show_home.emit()

    def set_status(self, title, msg="", color_hex=""):
        # Emitir señal en lugar de tocar UI directo
        self._sig_status.emit(str(title), str(msg), str(color_hex))

    def set_progress(self, val_0_1):
        self._sig_progress.emit(float(val_0_1))

    def log(self, msg):
        self._sig_log.emit(str(msg))

    def set_sync_enabled(self, enabled):
        self._sig_enable_sync.emit(bool(enabled))

    # --- Slots Internos (Corren en Main Thread) ---
    def _slot_show_selection(self, songs):
        try:
            self.populate_table(songs)
            self.set_selection_downloading_state(False) # Reset state
            self.set_sync_card_mode("RESULTS") # Update Sync card
            self.stack.setCurrentIndex(1) # Show Selection Page
        except Exception as e:
            self.log(f"UI ERROR: {e}")
            self.set_status("ERROR DE INTERFAZ", str(e), "#FF5555")

    def start_download_mode(self):
        self.set_selection_downloading_state(True)

    def show_library_page(self):
        self.stack.setCurrentIndex(2)

    def set_sync_card_mode(self, mode):
        # mode: "SYNC" or "RESULTS"
        try:
            self.btn_sync.clicked.disconnect()
        except: pass

        if mode == "RESULTS":
            self.btn_sync.title_label.setText("VER RESULTADOS")
            self.btn_sync.desc_label.setText("Volver a la lista detected")
            self.btn_sync.icon_label.setText("📝")
            self.btn_sync.clicked.connect(lambda: self.stack.setCurrentIndex(1))
        else:
            self.btn_sync.title_label.setText("SINCRONIZAR")
            self.btn_sync.desc_label.setText("Buscar nuevas canciones")
            self.btn_sync.icon_label.setText("🔄")
            self.btn_sync.clicked.connect(self.sig_sync.emit)

    def _setup_songs_page(self, parent):
        # --- Title ---
        lbl = QLabel("BIBLIOTECA DE CANCIONES", parent)
        lbl.setStyleSheet("font-family: 'Impact'; font-size: 40px; color: #F0E6D2;")
        lbl.move(50, 20) # Moved up
        lbl.resize(800, 50)
        
        lbl_sub = QLabel("Explora tu colección de canciones descargadas.", parent)
        lbl_sub.setStyleSheet("font-family: 'Segoe UI'; font-size: 14px; color: #aaa;")
        lbl_sub.move(55, 65) # Moved up

        # --- Search Bar ---
        icon = QPushButton("🔍", parent)
        icon.setStyleSheet("border: none; background: transparent; font-size: 16px;")
        icon.move(50, 95) # Moved up

        self.inp_library_search = QLineEdit(parent)
        self.inp_library_search.setPlaceholderText("Buscar en biblioteca...")
        self.inp_library_search.setGeometry(80, 95, 300, 30) # Moved up
        self.inp_library_search.setStyleSheet("""
            QLineEdit {
                background-color: rgba(0, 0, 0, 50);
                color: #ddd;
                border: 1px solid #444;
                border-radius: 15px;
                padding-left: 10px;
                font-family: 'Segoe UI';
            }
            QLineEdit:focus { border: 1px solid #0AC8B9; }
        """)
        self.inp_library_search.textChanged.connect(self.filter_library_table)

        # --- Table ---
        self.table_library = QTableWidget(parent)
        self.table_library.setGeometry(50, 140, 1000, 420) # Moved up + Increased Height
        self.table_library.setColumnCount(2)
        self.table_library.setHorizontalHeaderLabels(["Nombre de Canción / Carpeta", "Estado"])
        self.table_library.verticalHeader().setVisible(False)
        self.table_library.setAlternatingRowColors(True)
        self.table_library.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table_library.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table_library.setStyleSheet("""
            QTableWidget {
                background-color: rgba(0, 0, 0, 80);
                color: #ddd;
                gridline-color: #444; border: none;
                font-family: 'Segoe UI'; font-size: 13px;
            }
            QHeaderView::section {
                background-color: #222; color: #F0E6D2; padding: 5px; border: none; font-weight: bold;
            }
        """)
        self.table_library.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.table_library.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Fixed)
        self.table_library.setColumnWidth(1, 150)

        self.lbl_library_summary = QLabel("Total: 0 canciones", parent)
        self.lbl_library_summary.setStyleSheet("color: #0AC8B9; font-family: 'Segoe UI'; font-weight: bold; font-size: 13px;")
        self.lbl_library_summary.move(850, 100)
        self.lbl_library_summary.resize(200, 20)

    def populate_library_table(self, songs_list):
        self.table_library.setRowCount(0)
        for song_name in songs_list:
            row = self.table_library.rowCount()
            self.table_library.insertRow(row)
            
            # Name
            item_name = QTableWidgetItem(f"🎵 {song_name}")
            self.table_library.setItem(row, 0, item_name)
            
            # Status (Assuming installed if listed)
            item_status = QTableWidgetItem("Instalado")
            item_status.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            item_status.setForeground(QColor("#0AC8B9"))
            self.table_library.setItem(row, 1, item_status)
        
        self.lbl_library_summary.setText(f"Total: {len(songs_list)} canciones")

    def filter_library_table(self, text):
        text = text.lower()
        for i in range(self.table_library.rowCount()):
            item = self.table_library.item(i, 0) # Name column
            if item and text in item.text().lower():
                self.table_library.setRowHidden(i, False)
            else:
                self.table_library.setRowHidden(i, True)

    def _setup_about_page(self, parent):
        # About Info
        lbl_title = QLabel("WAZA HERO LAUNCHER", parent)
        lbl_title.setStyleSheet("font-family: 'Impact'; font-size: 40px; color: #0AC8B9;")
        lbl_title.move(50, 40)
        lbl_title.resize(800, 60)
        
        txt_info = QTextEdit(parent)
        txt_info.setReadOnly(True)
        txt_info.setGeometry(50, 120, 600, 400)
        txt_info.setStyleSheet("background: transparent; border: none; color: #ddd; font-family: 'Segoe UI'; font-size: 14px;")
        txt_info.setHtml(f"""
            <h1>Versión {VERSION}</h1>
            <p>Desarrollado para toda la <b>Wazisa</b>.</p>
            <p>Este launcher permite sincronizar automáticamente tus charts con Google Drive.</p>
            <br>
            <h3>Tecnologías</h3>
            <ul>
                <li>Python 3.10+</li>
                <li>PyQt6 (Modern UI)</li>
                <li>Google Drive API</li>
            </ul>
            <br>
            <p>Creado por <b>ChenSZN</b></p>
        """)

    # --- New Logic for Selection Page ---
    def filter_table(self, text):
        text = text.lower()
        for i in range(self.table_songs.rowCount()):
            item = self.table_songs.item(i, 1) # Name column
            if item and text in item.text().lower():
                self.table_songs.setRowHidden(i, False)
            else:
                self.table_songs.setRowHidden(i, True)

    def toggle_all_selection(self, state):
        # state is int: 0 (Unchecked) or 2 (Checked)
        check_state = Qt.CheckState(state)
        for i in range(self.table_songs.rowCount()):
            # Only toggle visible rows if filtered? 
            # UX: 'Select all' usually means what you see.
            if not self.table_songs.isRowHidden(i):
                item = self.table_songs.item(i, 0)
                item.setCheckState(check_state)

    # --- Page Change Logic ---
    def on_page_changed(self, index):
        # Index 1 is Selection Page -> Hide Header to allow full interaction
        if index == 1:
            self.frm_header.hide()
        else:
            self.frm_header.show()

    def _slot_show_home(self):
        self.stack.setCurrentIndex(0) # Show Home Page

    def _slot_status(self, title, sub, color):
        self.lbl_status.setText(title)
        self.lbl_substatus.setText(sub)
        if color:
            self.lbl_status.setStyleSheet(f"color: {color}; font-weight: bold; font-family: 'Segoe UI';")
        
        # Mirror to Selection Page if visible
        if hasattr(self, 'frm_selection_progress') and self.frm_selection_progress.isVisible():
            self.lbl_selection_status.setText(title.upper())
            self.lbl_selection_substatus.setText(sub)
            if color:
                self.lbl_selection_status.setStyleSheet(f"color: {color}; font-weight: bold; font-family: 'Segoe UI'; font-size: 11px;")

    def _slot_progress(self, val):
        self.pbar.setValue(int(val * 100))
        # Mirror to Selection Page
        if hasattr(self, 'frm_selection_progress') and self.frm_selection_progress.isVisible():
            self.pbar_selection.setValue(int(val * 100))

    def _slot_log(self, msg):
        self.console.append(msg)

    def _setup_update_banner(self, parent):
        self.frm_update = QFrame(parent)
        self.frm_update.setGeometry(200, 10, 700, 45)
        self.frm_update.setObjectName("GlassPanel")
        self.frm_update.setStyleSheet("""
            QFrame#GlassPanel {
                background-color: rgba(200, 170, 110, 40);
                border: 1px solid #C8AA6E;
                border-radius: 22px;
            }
        """)
        self.frm_update.hide()

        lyt = QHBoxLayout(self.frm_update)
        lyt.setContentsMargins(20, 0, 10, 0)

        self.lbl_update_text = QLabel("✨ ¡Nueva actualización disponible!", self.frm_update)
        self.lbl_update_text.setStyleSheet("color: #F0E6D2; font-weight: bold; border: none; background: transparent;")
        lyt.addWidget(self.lbl_update_text)

        lyt.addStretch()

        self.btn_get_update = QPushButton("DESCARGAR AHORA", self.frm_update)
        self.btn_get_update.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_get_update.setStyleSheet("""
            QPushButton {
                background-color: #C8AA6E;
                color: #111;
                font-weight: bold;
                border-radius: 12px;
                padding: 5px 15px;
                font-size: 11px;
            }
            QPushButton:hover { background-color: #F0E6D2; }
        """)
        self.update_url = ""
        self.btn_get_update.clicked.connect(self.on_update_clicked)
        lyt.addWidget(self.btn_get_update)

    def on_update_clicked(self):
        if self.update_url:
            webbrowser.open(self.update_url)

    def show_update_notification(self, version, url):
        self.update_url = url
        self.lbl_update_text.setText(f"✨ ¡Versión {version} disponible! Hay mejoras listas.")
        self.frm_update.show()
        # Simple animation
        self.frm_update.raise_()
        eff = QGraphicsOpacityEffect(self.frm_update)
        self.frm_update.setGraphicsEffect(eff)
        anim = QPropertyAnimation(eff, b"opacity")
        anim.setDuration(1000)
        anim.setStartValue(0)
        anim.setEndValue(1)
        anim.setEasingCurve(QEasingCurve.Type.InOutQuad)
        anim.start(QPropertyAnimation.DeletionPolicy.DeleteWhenStopped)
        self._update_anim = anim # Keep ref
        ver_bar = self.console.verticalScrollBar()
        ver_bar.setValue(ver_bar.maximum())

    def _slot_enable_sync(self, enabled):
        self.btn_sync.setEnabled(enabled)

    def open_url(self, url):
        webbrowser.open(url)

    # --- Mouse Events for Frameless Dragging ---
    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            # We allow dragging from the header area (top 80px)
            if event.position().y() < 80:
                self._dragging = True
                self._drag_pos = event.globalPosition().toPoint() - self.pos()
                event.accept()

    def mouseMoveEvent(self, event):
        if self._dragging and event.buttons() & Qt.MouseButton.LeftButton:
            self.move(event.globalPosition().toPoint() - self._drag_pos)
            event.accept()

    def mouseReleaseEvent(self, event):
        self._dragging = False

    # Aliases de compatibilidad
    def mainloop(self):
        pass

    def log(self, msg):
        # We removed the console, but might still want to print or logger
        print(f"[LOG] {msg}")

    def show_songs_alert(self, visible):
        if hasattr(self, 'frm_alert'):
            self.frm_alert.setVisible(visible)
