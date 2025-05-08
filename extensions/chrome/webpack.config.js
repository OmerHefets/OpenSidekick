const path = require("path");
const TerserWebpackPlugin = require("terser-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
    entry: {
        main: "./src/index.js",
        background: "./src/background/mainBackground.js",
        options: "./src/options/index.js",
    },
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "[name].bundle.js",
    },
    module: {
        rules: [
            {
                test: /\.jsx?$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader",
                },
            },
            {
                test: /\.css$/,
                use: ["style-loader", "css-loader"],
            },
        ],
    },
    resolve: {
        extensions: [".js", ".jsx"],
    },
    mode: "development",
    devtool: false, // Disable source maps to ensure CSP compliance
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                { from: "src/sidebar.html", to: "sidebar.html" },
                { from: "src/options.html", to: "options.html" },
            ],
        }),
    ],
    optimization: {
        minimize: true,
        minimizer: [
            new TerserWebpackPlugin({
                terserOptions: {
                    compress: {
                        drop_console: true,
                    },
                },
            }),
        ],
    },
};
