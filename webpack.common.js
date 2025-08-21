var webpack = require('webpack');
var path = require('path');

var src_path = path.resolve('./src');
var dist_path = path.resolve('./dist');

const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
    context: src_path,
    entry: [
        './index.js'
    ],
    output: {
        path: dist_path,
        filename: "[name]_[contenthash].bundle.js",
        clean: true
    },
    performance: {
        hints: false,
    },
    module: {
        rules: [{
            test: /\.(?:js|mjs|cjs|jsx?)$/i,
            exclude: /node_modules/,
            use: {
                loader: "babel-loader",
                options: {
                    cacheDirectory: true,
                    presets: [
                        [
                            "@babel/preset-env",
                            {
                                useBuiltIns: "usage",
                                corejs: "3.45",
                            },
                        ],
                        [
                            "@babel/preset-react",
                            {
                                runtime: "automatic",
                            },
                        ],
                    ],
                    plugins: [
                        ["@babel/plugin-proposal-decorators", { "version": "legacy" }]
                    ]
                },
            },
            generator: {
                filename: "[name]_[contenthash][ext][query]",
            },
        },
        {
            test: /\.css$/,
            use: [
                MiniCssExtractPlugin.loader,
            {
                loader: "css-loader",
                options: {
                    esModule: false
                }
            }]
        },
        {
            test: /\.(png|jpe?g|gif|webp|ico)$/i,
            type: "asset/resource",
            generator: {
                filename: "img/[name]_[contenthash][ext]",
            },
        },
        {
            test: /\.(woff2?|eot|ttf|otf)(\?v=\d+\.\d+\.\d+)?$/,
            type: "asset/resource",
            generator: {
                filename: "fonts/[name]_[contenthash][ext]",
            },
        },
        {
            test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
            type: "asset",
            generator: {
                filename: "img/[name]_[contenthash][ext]",
            },
        },
        {
            test: /\.wasm$/,
            type: "asset/resource",
            generator: {
                filename: "[name]_[contenthash][ext]",
            },
        },
        {
            test: /\.md$/,
            use: [{
                loader: "html-loader",
            },
            {
                loader: "markdown-loader"
            }]
        },
        {
            test: /\.worker\.js$/,
            use: [{
                loader: "worker-loader",
                options: {
                    esModule: false,
                    filename: "workers/[name]_[contenthash].worker.js"
                }
            }]
        }]
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: "./index.html",
            favicon: "./favicon.ico"
        }),
        new MiniCssExtractPlugin({
            filename: "[name]_[contenthash].css",
        }),
        new CopyPlugin({
            patterns: [
                { from: "./cnctoolpath.svg", to: "cnctoolpath.svg" },
            ],
        }),
        new webpack.ProvidePlugin({$: 'jquery', jQuery: 'jquery'}),
        new webpack.HotModuleReplacementPlugin(),
    ],
};
