import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from scroll_tools import CanvasScroll


class ScrollTests(unittest.TestCase):
    def setUp(self):
        self.canvas = Mock()
        self.canvas.tk.call.return_value = 'win32'
        self.canvas.winfo_fpixels.return_value = 96
        self.canvas.winfo_width.return_value = 800
        self.canvas.winfo_height.return_value = 600
        self.scroll = CanvasScroll(self.canvas)
        self.setting = patch('scroll_tools.wheel_setting', return_value=3)
        self.preference = self.setting.start()
        self.addCleanup(self.setting.stop)

    def event(self, delta, state=0, num=None):
        self.scroll.wheel(SimpleNamespace(delta=delta, state=state, num=num))

    def test_horizontal_trackpad_leaves_vertical_position_alone(self):
        self.event(-120, state=1)
        self.canvas.xview_scroll.assert_called_once_with(100, 'units')
        self.canvas.yview_scroll.assert_not_called()
        self.preference.assert_called_with(True)

    def test_small_deltas_accumulate_to_one_notch(self):
        for _ in range(120):
            self.event(-1)
        total = sum(c.args[0] for c in self.canvas.yview_scroll.call_args_list)
        self.assertAlmostEqual(total + self.scroll.remainder['y'], 100)
        self.assertLessEqual(max(c.args[0] for c in self.canvas.yview_scroll.call_args_list), 1)

    def test_zero_delta_and_disabled_scrolling(self):
        self.event(0)
        self.preference.return_value = 0
        self.event(-120)
        self.canvas.yview_scroll.assert_not_called()

    def test_os_page_scroll_and_dpi(self):
        self.preference.return_value = 0xFFFFFFFF
        self.event(-120)
        self.canvas.yview_scroll.assert_called_with(600, 'units')
        self.preference.return_value = 3
        self.canvas.winfo_fpixels.return_value = 144
        self.event(120)
        self.canvas.yview_scroll.assert_called_with(-150, 'units')

    def test_x11_buttons_and_mac_small_deltas(self):
        self.event(0, num=6)
        self.canvas.xview_scroll.assert_called_with(-100, 'units')
        self.event(0, num=7)
        self.canvas.xview_scroll.assert_called_with(100, 'units')
        self.event(0, num=5)
        self.canvas.yview_scroll.assert_called_with(100, 'units')
        self.scroll.system = 'aqua'
        self.event(-2)
        self.canvas.yview_scroll.assert_called_with(2, 'units')
