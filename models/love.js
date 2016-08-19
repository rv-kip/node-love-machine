module.exports = function(sequelize, DataTypes) {
    return sequelize.define('love', {
        id: {
            type: DataTypes.INTEGER(10),
            allowNull: false,
            primaryKey: true,
            autoIncrement: true
        },
        created: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW()
        },
        sender: {
            type: DataTypes.STRING,
            allowNull: false
        },
        recipient: {
            type: DataTypes.STRING,
            allowNull: false
        },
        message: {
            type: DataTypes.STRING,
            allowNull: false
        },
    },
    {
        tableName: 'love',
        charset: 'utf8mb4'
    });
};
