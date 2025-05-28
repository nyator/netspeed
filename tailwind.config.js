/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./App.tsx", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
     fontFamily: {
        sBlack: ["Satoshi-Black"],
        sBold: ["Satoshi-Bold"],
        sLight: ["Satoshi-Light"],
        sMedium: ["Satoshi-Medium"],
        sRegular: ["Satoshi-Regular"],
      },
    },
  },
  plugins: [],
}